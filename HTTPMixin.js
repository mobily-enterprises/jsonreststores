/*
Copyright (C) 2016 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var url = require('url')
var querystring = require('querystring')
var multer = require('multer')
var crypto = require('crypto')

var HTTPMixin = (superclass) => class extends superclass {
  //
  // Which fields are to be considered "upload" ones
  static get uploadFields () { return {} }

  // Upload limits following multer's format
  static get uploadLimits () { return null }

  // Upload filters to conditionally stop files
  uploadFilter (req, file, cb) { return cb(null, true) }

  // How to chain errors
  static get chainErrors () { return 'nonhttp' }

  constructor () {
    super()
    this.uploadFields = this.constructor.uploadFields
    this.uploadLimits = this.constructor.uploadLimits
    this.chainerrors = this.constructor.chainerrors
    this.uploadFilter = this.constructor.uploadFilter
  }

  // Sends the information out, for HTTP calls.
  // The medium is request._res, which is set in protocolListenHTTP
  protocolSendHTTP (request, method, data) {
    var self = this
    var from
    var to
    var responseBody
    var status = 200

    // If it's sending and error, `data` is the actual error. It will be
    // formatted using the object's formatErrorResponse method
    if (method === 'error') responseBody = self.formatErrorResponse(data)
    else responseBody = data

    // Sets location and range headers
    switch (method) {
      case 'post':
        status = 201
        if (self.handleGet) { request._res.setHeader('Location', request._req.originalUrl + data[ self.idProperty ]) }
        break

      case 'put':
        status = 201
        if (self.handleGet) {
          request._res.setHeader('Location', request._req.originalUrl)
        }
        break

      case 'delete':
        status = 200
        break

      case 'error':
        status = data.status || 500
        break

      case 'getQuery':
        if (request.options.ranges) {
          // Working out from-to/of
          // Note that if no records were returned, the format should be 0-0/X

          // Nice shorter variables
          var skip = request.options.ranges.skip || 0
          var total = request.total

          // Work out 'of': it will depend on the grandTotal, and that's it. It's an easy one.
          var of = request.grandTotal

          if (typeof request.grandTotal !== 'undefined') {
            // If nothing was returned, then the format 0-0/grandTotal is honoured
            if (!total) {
              from = 0
              to = 0
            // If something was returned, then `from` is the same as `skip`, and `to`
            // will depends on how many records were returned
            } else {
              from = skip
              to = from + total - 1
            }

            request._res.setHeader('Content-Range', 'items ' + from + '-' + to + '/' + of)
          }
        }
        break
    }

    // Send the response using HTTP
    request._res.status(status).json(responseBody)
  }

  protocolListenHTTP (params) {
    var url = this.getFullPublicURL()
    var app = params.app
    var idName

    var self = this

    // Make up the upload middleware to parse the files correctly
    // The middleware will be empty if there are no upload fields
    var uploadMiddleware
    if (!Object.keys(self.uploadFields).length) {
      uploadMiddleware = function (req, res, next) { next(null) }
    } else {
      // Make up the storage for multer
      var storage = multer.diskStorage({
        destination: self._determineUploadDestinaton.bind(self),
        filename: self._determineUploadFileName.bind(self)
      })

      // Make up the iptions
      var options = { storage: storage, fileFilter: self._multerFileFilter.bind(self) }
      // Commeted out as it throws generic errors, which become 503s
      if (self.uploadLimits) options.limits = self.uploadLimits

      // Create the multer middleware. Errors are wrapped around HTTP error UnprocesableEntity
      // otherwise the server will generate 503 for big uploads
      var upload = multer(options).any()
      uploadMiddleware = function (req, res, next) {
        upload(req, res, function (err) {
          if (err) return self._uploadErrorProcessor(err, next)

          if (req.files && Array.isArray(req.files)) {
            req.files.forEach((f) => {
              req.body[f.fieldname] = f.filename
            })
          }
          next(null)
        })
      }
    }

    // Public URL must be set
    if (!url) {
      throw (new Error('protocolListenHTTP must be called on a store with a public URL'))
    }

    // First, look for the last /some/:word in the URL
    idName = url.match(/:\w*$/)
    if (!idName) {
      throw (new Error("A store's URL needs to end with a :columned token representing its ID, this is not valid: " + url))
    } else {
      // Found it: normalise it to a simple string rather than the 1 element array we received
      idName = idName[0]
    }

    url = url.replace(/:\w*$/, '')
    // console.log('URL:', url)

    // Make entries in "app", so that the application
    // will give the right responses
    app.get(url + idName, this._getRequestHandler('get'))
    app.get(url, this._getRequestHandler('getQuery'))
    app.put(url + idName, uploadMiddleware, this._getRequestHandler('put'))
    app.post(url, uploadMiddleware, this._getRequestHandler('post'))
    app.delete(url + idName, this._getRequestHandler('delete'))

    // Add store entries for single fields
    Object.keys(this._singleFields).forEach(function (key) {
      app.get(url + idName + '/' + key, uploadMiddleware, self._getRequestHandler('getField', key))
      app.put(url + idName + '/' + key, uploadMiddleware, self._getRequestHandler('putField', key))
    })
  }

  // Will make sure only fields marked as file uploads are accepted
  _multerFileFilter (req, file, cb) {
    var self = this

    var storeAttributes = self.uploadFields[ file.fieldname ]

    // If it's not in uploadFields, then end of the story: not allowed
    if (!storeAttributes) {
      var UnprocessableEntityError = this.constructor.UnprocessableEntityError
      return cb(new UnprocessableEntityError('Unacceptable upload field: ' + file.fieldname), false)

    // There is no filter set by the store itself: allow it.
    } else if (typeof (self.uploadFilter) !== 'function') {
      return cb(null, true)

    // There is a filter: run it, the filter will either allow it or reject it
    } else {
      return self.uploadFilter.apply(this, [].slice.call(arguments))
    }
  }

  _determineUploadDestinaton (req, file, cb) {
    var self = this

    var storeAttributes = self.uploadFields[ file.fieldname ]

    if (typeof (storeAttributes.destination) === 'string') {
      return cb(null, storeAttributes.destination)
    } else if (typeof (storeAttributes.destination) === 'function') {
      return storeAttributes.destination.apply(this, [].slice.call(arguments))
    } else {
      return cb(new Error('destination needs to be set as string or function for uploadField entries'))
    }
  }
  _determineUploadFileName (req, file, cb) {
    var self = this

    var storeAttributes = self.uploadFields[ file.fieldname ]

    // If there is a function defined as fileName, use it
    if (typeof (storeAttributes.fileName) === 'function') {
      return storeAttributes.fileName.apply(this, [].slice.call(arguments))
    // If not, just use the stock function that mixes the record ID with the fieldName in one string
    } else {
      // If the ID is there (that's the case with a PUT), then use it. Otherwise,
      // simply generate a random string
      var id = req.params[ this.idProperty ]
      if (!id) id = crypto.randomBytes(20).toString('hex')

      // That's it
      return cb(null, file.fieldname + '_' + id)
    }
  }

  _getRequestHandler (method, field) {
    var self = this

    if ([ 'get', 'getQuery', 'put', 'post', 'delete', 'getField', 'putField' ].indexOf(method) === -1) {
      throw (new Error('method can be get, getQuery, put, post, delete, fetField, putField'))
    }

    return async function (req, res, next) {
      var request = {}
      var funcName

      try {
        var _sleep = (ms) => { if (!ms) return; return new Promise(resolve => setTimeout(resolve, ms)) }

        Object.setPrototypeOf(req.body, Object.prototype)

        // Sets all of the required fields for a request
        request.remote = true
        request.protocol = 'HTTP'
        request.params = self._co(req.params) // NOTE: this is a copy
        request.body = self._co(req.body) // NOTE: this is a copy
        request.session = req.session
        request.options = {}

        try {
          request.options = self._initOptionsFromReq(method, req)
        } catch (e) { return next(e) }

        // Sets the request's _req and _res variables, extra fields hooks might want to use
        // request._res will be used as a sending medium by protocolSendHTTP
        request._req = req
        request._res = res

        // GetField and PutField are pseudo-request that will be translated back
        // into `Put` and `Get` (with `field` set in option)
        if (method === 'getField') {
          funcName = 'Get'
          request.options.field = field
        } else if (method === 'putField') {
          funcName = 'Put'
          request.options.field = field
        } else {
          funcName = method[0].toUpperCase() + method.slice(1)
        }

        // I dreamed of being able to do this in node for _years_
        await _sleep(self.constructor.artificialDelay)

        try {
          var data = await self['_make' + funcName](request)
          self.protocolSendHTTP(request, method, data)
        } catch (error) {
          // Let the store log the error
          self.logError(request, error)

          // See what to do with the error
          var chainErrors = self.constructor.chainErrors

          // Case #1: All errors are to be chained: chain
          if (chainErrors === 'all') return next(error)

          // Case #2: Only non-http errors are to be chained. "Maybe" chain, "maybe" not
          if (chainErrors === 'nonhttp') {
            if (typeof error.status === 'undefined') return next(error)
            else self.protocolSendHTTP(request, 'error', error)
          }
          // Case #3: No errors are to be chained: send error regardless
          if (chainErrors === 'none') {
            self.protocolSendHTTP(request, 'error', error)
          }
        }
      } catch (e) {
        return next(e)
      }
    }
  }

  _initOptionsFromReq (method, req) {
    var self = this

    var options = {}

    // Set the 'overwrite' option if the right header
    // is there
    if (method === 'put') {
      if (req.headers[ 'if-match' ] === '*') {
        options.overwrite = true
      }
      if (req.headers[ 'if-none-match' ] === '*') {
        options.overwrite = false
      }
    }

    // deleteAfterGetQuery will depend on the store's setting
    if (method === 'getQuery') {
      if (self.deleteAfterGetQuery) options.delete = !!self.deleteAfterGetQuery
    }

    // Put and Post can come with extra headers which will set
    // options.putBefore and options.putDefaultPosition
    if (method === 'put' || method === 'post') {
      // positioning can be 'after', 'start' or 'end'
      if (typeof (req.headers[ 'placement' ]) !== 'undefined') {
        options.placement = req.headers[ 'placement' ]

        if (options.placement === 'after') {
          options.placementAfter = req.headers[ 'placement-after' ]
        }
      }
    }

    // Set the 'SortBy', 'ranges' and 'conditions' in
    // the options, based on the passed headers

    if (method === 'getQuery') {
      options.sort = self._parseSortBy(req)
      options.ranges = self._parseRangeHeaders(req)
    }

    if (method === 'getQuery' || method === 'get') {
      options.conditionsHash = self._parseConditions(req)
    }

    // If the range wasn't provided, it will force it to be the one set by the
    // store's limit, so that range headers will be returned anyway,
    // otherwise the client
    if (!options.ranges) {
      options.ranges = { }
    }

    // If self.defaultSort was passed, then maybe it needs to be applied (depending on options.sort)
    if (self.defaultSort) {
      // If it's not a valid object, it's null, or it IS a valid object but it's empty, apply default sorting
      if (typeof (options.sort) !== 'object' || options.sort === null || Object.getOwnPropertyNames(options.sort).length === 0) {
        options.sort = self.defaultSort
      }
    }

    return options
  }

  _parseSortBy (req) {
    var urlParts = url.parse(req.url, false)
    var q = urlParts.query || ''
    var sortObject = {}
    var sortBy, tokens, token, tokenClean
    var sortDirection, sortField

    var self = this

    var result = querystring.decode(q)
    sortBy = result.sortBy

    // No sort options: return an empty object
    if (!sortBy) return {}

    tokens = sortBy.split(',')
    for (var i = 0; i < tokens.length; i++) {
      token = tokens[ i ]

      tokenClean = token.replace('+', '').replace('-', '').replace(' ', '').replace('*', '')

      if (self.sortableFields.indexOf(tokenClean) === -1) {
        throw (new Error('Field selected for sorting invalid: ' + tokenClean))
      }

      if (tokens[ i ][ 0 ] === '*' || tokens[ i ][ 0 ] === ' ' || tokens[ i ][ 0 ] === '+' || tokens[ i ][ 0 ] === '-') {
        sortDirection = tokens[ i ][ 0 ] === '-' ? -1 : 1
        sortField = tokenClean
        sortObject[ sortField ] = sortDirection
      }
    }
    return sortObject
  }

  _parseRangeHeaders (req) {
    var tokens
    var rangeFrom, rangeTo, limit
    var hr

    // If there was a range request, then set the range to the
    // query and return the count
    if ((hr = req.headers['range']) && (tokens = hr.match(/items=([0-9]+)-(([0-9]+)||(Infinity))$/))) {
      rangeFrom = tokens[1] - 0
      rangeTo = tokens[2] - 0
      if (rangeTo === 'Infinity') {
        return ({
          skip: rangeFrom
        })
      } else {
        limit = rangeTo - rangeFrom + 1

        return ({
          skip: rangeFrom,
          limit: limit
        })
      }
    }

    // Range headers not found or not valid, return null
    return { skip: 0, limit: this.defaultLimitOnQueries }
  }

  _parseConditions (req) {
    var urlParts = url.parse(req.url, false)
    var q = urlParts.query || ''
    var result

    result = querystring.decode(q)
    delete result.sortBy

    return result
  }

  // Turns an error into an UnprocessableEntityError
  _uploadErrorProcessor (err, next) {
    var UnprocessableEntityError = this.constructor.UnprocessableEntityError
    var ReturnedError = new UnprocessableEntityError(err.message)
    ReturnedError.OriginalError = err
    return next(ReturnedError)
  }
}

exports = module.exports = HTTPMixin
