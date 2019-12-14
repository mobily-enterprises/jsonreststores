/*
Copyright (C) 2019 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const e = require('allhttperrors')
const path = require('path')
const fs = require('fs')
const semver = require('semver')

const registryByName = {}
const registryByVersion = {}

const Store = exports = module.exports = class {
  // ****************************************************
  // *** ATTRIBUTES THAT CAN TO BE DEFINED IN PROTOTYPE
  // ****************************************************

  static get publicURLprefix () { return null }
  static get version () { return null }
  static get publicURL () { return null } // Not mandatory (if you want your store to be API-only for some reason)

  static get idProperty () { return null } // If not set, taken as last item of paramIds)
  static get paramIds () { return [] } // Only allowed if publicURL is not set

  static get storeName () { return null }
  static get artificialDelay () { return 0 } // Artificial delay

  // ****************************************************
  // *** ATTRIBUTES THAT DEFINE STORE'S BEHAVIOUR
  // ****************************************************

  static get handlePut () { return false }
  static get handlePost () { return false }
  static get handleGet () { return false }
  static get handleGetQuery () { return false }
  static get handleDelete () { return false }
  static get defaultLimitOnQueries () { return 50 } //  Max number of records returned by default

  // Default error objects which might be used by this module.
  static get BadRequestError () { return e.BadRequestError }
  static get UnauthorizedError () { return e.UnauthorizedError }
  static get ForbiddenError () { return e.ForbiddenError }
  static get NotFoundError () { return e.NotFoundError }
  static get PreconditionFailedError () { return e.PreconditionFailedError }
  static get UnprocessableEntityError () { return e.UnprocessableEntityError }
  static get NotImplementedError () { return e.NotImplementedError }
  static get ServiceUnavailableError () { return e.ServiceUnavailableError }

  // Static getter/setter which will actually manipulate the one `registry` variable

  register () {
    // const self = this
    const name = this.storeName
    const version = this.version

    registryByName[name] = registryByName[name] || {}
    registryByVersion[version] = registryByVersion[version] || {}

    if (registryByName[name][version]) {
      throw new Error('Store already registered: ' + name + ' version ' + version)
    }

    registryByName[name][version] = registryByVersion[version][name] = this
  }

  get stores () {
    const thisVersion = this.version
    return new Proxy({}, {
      get: function (obj, prop) {
        // Store is not defined: do not return anything
        if (!registryByName[prop]) return undefined

        // Exact version available: return it
        if (registryByName[prop][thisVersion]) {
          return registryByName[prop][thisVersion]
        }

        // Look for the highest version below the one of the
        // calling store
        const rightVersion = Object.keys(registryByName[prop])
          .filter(el => semver.satisfies(registryByName[prop][el].version, `<${thisVersion}`))
          .sort((a, b) => semver.compare(a, b))
          .shift()

        // Return what was found, if was found
        if (rightVersion) {
          return registryByName[prop][rightVersion]
        } else {
          return undefined
        }
      }
    })
  }

  static requireStoresFromPath (p, app) {
    fs.readdirSync(p).forEach((storeFile) => {
      if (!storeFile.endsWith('.js')) return
      const store = require(path.join(p, storeFile))
      if (app) store.listen({ app })
    })
  }

  // Methods that MUST be implemented for the store to be functional
  // They need to satisfy the JsonRestStores DB API

  async implementFetch (request) {
    throw (new Error('implementFetch not implemented, store is not functional'))
  }

  async implementInsert (request) {
    throw (new Error('implementInsert not implemented, store is not functional'))
  }

  async implementUpdate (request) {
    throw (new Error('implementUpdate not implemented, store is not functional'))
  }

  async implementDelete (request) {
    throw (new Error('implementDelete not implemented, store is not functional'))
  }

  async implementQuery (request) {
    throw (new Error('implementQuery not implemented, store is not functional'))
  }

  async checkNetworkPermissions (request) {}

  // ****************************************************
  // *** ERROR-MANAGING HELPER FUNCTIONS
  // ****************************************************

  formatErrorResponse (error) {
    if (error.errors) {
      return { message: error.message, errors: error.errors }
    } else {
      return { message: error.message }
    }
  }

  logError (request, error) {
  }

  // **************************************************************************
  // *** END OF FUNCTIONS/ATTRIBUTES THAT NEED/CAN BE OVERRIDDEN BY DEVELOPERS
  // **************************************************************************

  constructor () {
    const Constructor = this.constructor

    // Copy values over from the class' static values
    this.publicURLprefix = Constructor.publicURLprefix
    this.publicURL = Constructor.publicURL
    this.idProperty = Constructor.idProperty
    this.paramIds = [...Constructor.paramIds]
    this.storeName = Constructor.storeName

    this.handlePost = Constructor.handlePost
    this.handlePut = Constructor.handlePut
    this.handleGet = Constructor.handleGet
    this.handleGetQuery = Constructor.handleGetQuery
    this.handleDelete = Constructor.handleDelete
    this.defaultLimitOnQueries = Constructor.defaultLimitOnQueries
    this.version = Constructor.version

    // The store name must be defined
    if (this.storeName === null) {
      throw (new Error('You must define a store name for a store in constructor class'))
    }

    // The store name must be defined
    if (this.version === null) {
      throw (new Error('You must define a store version in constructor class'))
    }

    // If paramId is not specified, takes it from publicURL
    if (this.paramIds.length === 0 && typeof (this.publicURL) === 'string') {
      this.paramIds = (this.publicURL + '/')
        .match(/:.*?\/+/g)
        .map((i) => { return i.substr(1, i.length - 2) })
    }

    // If idProperty is not set, derive it from this._lastParamId()
    if (!this.idProperty) {
      if (this.paramIds.length === 0) {
        throw (new Error('Your store needs to set idProperty, or alternatively set paramIds (idProperty will be the last paramId). Store: ' + this.storeName))
      }

      // Sets this.idProperty, which (as for the principle of
      // least surprise) must be the last paramId passed to
      // the Constructor.
      this.idProperty = this._lastParamId()
    }

    this.register()
  }

  fullPublicURL () {
    if (!this.publicURL) return null
    return path.join('/', this.publicURLprefix || '', this.version, this.publicURL)
  }

  _lastParamId () {
    return this.paramIds[this.paramIds.length - 1]
  }

  _sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async _makePost (request) {
    // Check that the method is implemented
    if (!this.handlePost && request.remote) throw new Store.NotImplementedError()

    return await this.implementInsert(request) || null
  }

  async _makePut (request) {
    // Check that the method is implemented
    if (!this.handlePut && request.remote) throw new Store.NotImplementedError()

    // Fetch the record
    // The fact that it's assigned to request.record means that
    // implementFetch will use it without re-fetching
    // SIDE_EFFECT: request.record
    request.record = await this.implementFetch(request) || null

    // Check the 'overwrite' option, throw if fail
    if (typeof request.options.overwrite !== 'undefined') {
      if (request.record && !request.options.overwrite) {
        throw new this.PreconditionFailedError()
      } else if (!request.record && request.options.overwrite) {
        throw new this.PreconditionFailedError()
      }
    }

    if (!request.record) {
      // Execute actual DB operation
      return await this.implementInsert(request, 'put') || null
    } else {
      // Execute actual DB operation
      return await this.implementUpdate(request, 'put') || null
    }
  }

  async _makeGet (request) {
    // Check that the method is implemented
    if (!this.handleGet && request.remote) throw new Store.NotImplementedError()

    const record = await this.implementFetch(request) || null

    // Record not there: not found error!
    if (!record) throw new Store.NotFoundError()

    return record
  }

  async _makeGetQuery (request) {
    // Check that the method is implemented
    if (!this.handleGetQuery && request.remote) throw new Store.NotImplementedError()

    // Execute actual DB operation
    const { data, grandTotal } = await this.implementQuery(request)

    // Sets request.total and request.grandTotal, which will be used
    // by HTTPMixin to write out headers
    // SIDE_EFFECT: request.total, request.grandTotal
    request.total = data.length
    if (typeof grandTotal !== 'undefined') request.grandTotal = grandTotal

    return data
  }

  async _makeDelete (request) {
    // Check that the method is implemented
    if (!this.handleDelete && request.remote) throw new Store.NotImplementedError()

    const record = await this.implementFetch(request, 'delete') || null
    // Record not there: not found error!
    if (!record) throw new Store.NotFoundError()

    // SIDE_EFFECT: request.record
    request.record = record
    await this.implementDelete(request)
    return record
  }

  apiGetQuery (options) {
    options = options || {}

    // Make up the request
    const request = {}
    request.remote = false
    request.body = {}
    if (options.apiParams) request.params = options.apiParams
    else request.params = {}

    request.session = options.session || {}
    request.options = { ...options }

    this._makeGetQuery(request)
  }

  apiGet (id, options) {
    options = options || {}

    // Make up the request
    const request = {}
    request.remote = false
    request.options = { ...options }
    request.body = {}
    if (options.apiParams) request.params = options.apiParams
    else { request.params = {}; request.params[this.idProperty] = id }
    request.session = options.session || {}

    // Actually run the request
    this._makeGet(request)
  }

  apiPut (body, options) {
    options = options || {}

    // This will only work if this.idProperty is included in the body object
    if (typeof (body[this.idProperty]) === 'undefined') {
      throw (new Error('When calling Store.apiPut with an ID of null, id MUST be in body'))
    }

    // Make up the request
    const request = {}
    request.remote = false
    request.options = { ...options }
    request.body = { ...body }
    if (options.apiParams) request.params = options.apiParams
    else { request.params = {}; request.params[this.idProperty] = body[this.idProperty] }
    request.session = options.session || {}

    // Actually run the request
    this._makePut(request)
  }

  apiPost (body, options) {
    options = options || {}

    // Make up the request
    const request = {}
    request.remote = false
    request.options = { ...options }
    request.params = options.apiParams || {}
    request.session = options.session || {}
    request.body = { ...body }

    // Actually run the request
    this._makePost(request)
  }

  apiDelete (id, options, next) {
    options = options || {}

    // Make up the request
    const request = {}
    request.body = {}
    request.options = { ...options }
    if (options.apiParams) request.params = options.apiParams
    else { request.params = {}; request.params[this.idProperty] = id }
    request.session = options.session || {}

    // Actually run the request
    this._makeDelete(request, next)
  }
}
