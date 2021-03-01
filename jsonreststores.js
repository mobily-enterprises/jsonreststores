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
  // Hooks to inject code in workflow
  async beforeValidate (request) { }
  async validate (request) { return [] }
  async checkPermissions (request) { return { granted: true } }

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
  static get defaultLimitOnQueries () { return 1000 } //  Max number of records returned by default

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

  static stores (version) {
    return new Proxy({}, {
      get: function (obj, prop) {
        // Store is not defined: do not return anything
        if (!registryByName[prop]) return undefined

        // Exact version available: return it
        if (registryByName[prop][version]) {
          return registryByName[prop][version]
        }

        // Look for the highest version below the one of the
        // calling store
        const rightVersion = Object.keys(registryByName[prop])
          .filter(el => semver.satisfies(registryByName[prop][el].version, `<${version}`))
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

  get stores () {
    return this.constructor.stores(this.version)
  }

  static requireStoresFromPath (p, app) {
    fs.readdirSync(p).forEach((storeFile) => {
      if (!storeFile.endsWith('.js')) return
      const store = require(path.join(p, storeFile))
      if (app && store.publicURL) store.listen({ app })
    })
  }

  // Methods that MUST be implemented for the store to be functional
  // They need to satisfy the JsonRestStores DB API

  async implementFetch (request) {
    request.method = request.method || 'get'
    request.inMethod = 'implementFetch'
    request.options = request.options || {}

    const id = request.params[this.idProperty]
    if (!id) throw new Error('request.params needs to contain idProperty for implementFetch')

    // Checking of permission must be delegated to the implementing function which
    // must call this.implementFetchPermissions(request) once request.record is set
  }

  async implementFetchPermissions (request) {
    // Check for permissions
    const { granted, message } = await this.checkPermissions(request)
    if (!granted) throw new this.constructor.ForbiddenError(message)
  }

  _enrichBodyWithParamIds (request) {
    // SIDE_EFFECT: body[paramId]
    this.paramIds.forEach((paramId) => {
      if (typeof (request.params[paramId]) !== 'undefined') {
        request.body[paramId] = request.params[paramId]
      }
    })
  }

  // Check that paramsId are actually legal IDs using
  // paramsSchema.
  async _validateParams (request, skipIdProperty) {
    const fieldErrors = []

    const params = request.params || {}

    // Params is empty: nothing to do, optimise a little
    if (params.length === 0) return

    // Check that _all_ paramIds are in params
    // (Direct requests don't use URL, so check)
    this.paramIds.forEach((k) => {
      // "continue" if id property is to be skipped
      if (skipIdProperty && k === this.idProperty) return

      // Required paramId not there: puke!
      if (typeof (params[k]) === 'undefined') {
        fieldErrors.push({ field: k, message: 'Field required in the URL/param: ' + k })
      }
    })
    // If one of the key fields was missing, puke back
    if (fieldErrors.length) throw new this.constructor.BadRequestError({ errors: fieldErrors })

    // Prepare skipFields, depending on skipIdProperty
    const skipFields = []
    if (skipIdProperty) {
      skipFields.push(this.idProperty)
    }

    // Validate params
    const { validatedObject, errors } = await this.schema.validate(params, { onlyObjectValues: true, skipFields })
    if (errors.length) throw new this.constructor.BadRequestError({ errors: errors })

    return validatedObject
  }

  // SIDE_EFFECT: record
  cleanup (record) {
    const r = Object.assign({}, record)
    for (const k in r) {
      if (typeof this.schema.structure[k] === 'undefined') delete r[k]
    }
    return r
  }

  // SIDE_EFFECTS:
  //   request.body[beforeIdField] moved to request.beforeId
  //   request.body (enriched with paramIds)
  //   request.originalBody
  //   request.params (whole object replaced by _validateParams)
  //   request.originalParams (whole object replaced by _validateParams)
  async implementInsert (request) {
    request.method = request.method || 'post'
    request.inMethod = 'implementInsert'
    request.options = request.options || {}

    if (this.positionField) {
      request.beforeId = request.body[this.beforeIdField]
      delete request.body[this.beforeIdField]
    }

    // validateParam
    request.originalParams = request.params || {}
    request.params = await this._validateParams(request, true)

    // Add paramIds to body
    this._enrichBodyWithParamIds(request)

    // Assigning an empty record, since there is no data
    request.record = {}

    // Prepare the errors array
    let errors = []

    // This is an important hook as developers might want to
    // manipulate request.body before validation (e.g. non-schema custom fields)
    // or manipulate the request itself
    await this.beforeValidate(request, errors)

    const fullRecord = this.fullRecordOnInsert || request.options.fullRecordOnInsert

    const emptyAsNull = typeof request.options.emptyAsNull !== 'undefined'
      ? !!request.options.emptyAsNull
      : this.emptyAsNull

    const canBeNull = typeof request.options.canBeNull !== 'undefined'
      ? !!request.options.canBeNull
      : this.canBeNull

    // Validate input. This is light validation.
    const { validatedObject, errors: validationErrors } = await this.schema.validate(request.body, {
      emptyAsNull,
      canBeNull,
      onlyObjectValues: !fullRecord
    })

    request.originalBody = request.body
    request.body = validatedObject

    // Enrich the error array with the extra validation errors (if any)
    if (validationErrors.length) errors = [...errors, ...validationErrors]

    // Check for permissions
    const { granted, message } = await this.checkPermissions(request, errors)
    if (!granted) throw new this.constructor.ForbiddenError(message)

    // Call the validate hook. This will carry more expensive validation once
    // permissions are granted
    await this.validate(request, errors)
    if (errors.length) throw new this.constructor.UnprocessableEntityError({ errors })

    // Reinstating request.body.beforeId must be delegated to the implementing function which
    // must call this.restoreBeforeIdInRecord(request) in order to restore it
  }
  //   request.originalRecord

  // SIDE_EFFECT:
  //   request.record (created, if not already set)
  //   request.body[beforeIdField] (maybe deleted)
  //   request.params (whole object replaced by _validateParams())
  //   request.body (added paramIds)
  //   request.originalBody
  //   request.options
  async implementUpdate (request) {
    request.method = request.method || 'put'
    request.inMethod = 'implementUpdate'
    request.options = request.options || {}

    if (this.positionField) {
      request.beforeId = request.body[this.beforeIdField]
      delete request.body[this.beforeIdField]
    }

    // validateParam
    request.originalParams = request.params || {}
    request.params = await this._validateParams(request)

    const id = request.params[this.idProperty]
    if (!id) throw new Error('request.params needs to contain idProperty for implementUpdate')

    // Add paramIds to body
    this._enrichBodyWithParamIds(request)

    // Load the record, if it is not yet present in request as `record`
    if (!request.record) {
      request.record = await this.implementFetch(request)
    }

    // Prepare the errors array
    let errors = []

    // This is an important hook as developers might want to
    // manipulate request.body before validation (e.g. non-schema custom fields)
    // or manipulate the request itself
    await this.beforeValidate(request, errors)

    const fullRecord = this.fullRecordOnUpdate || request.options.fullRecordOnUpdate

    // Validate input. This is light validation.
    const { validatedObject, errors: validationErrors } = await this.schema.validate(request.body, {
      emptyAsNull: request.options.emptyAsNull || this.emptyAsNull,
      onlyObjectValues: !fullRecord,
      record: request.record
    })

    request.originalBody = request.body
    request.body = validatedObject

    // Enrich the error array with the extra validation errors (if any)
    if (validationErrors.length) errors = [...errors, ...validationErrors]

    // Check for permissions
    const { granted, message } = await this.checkPermissions(request, errors)
    if (!granted) throw new this.constructor.ForbiddenError(message)

    await this.validate(request, errors)
    if (errors.length) throw new this.constructor.UnprocessableEntityError({ errors })

    // Reinstating request.body.beforeId must be delegated to the implementing function which
    // must call this.restoreBeforeIdInRecord(request) in order to restore it
  }

  async restoreBeforeIdInRecord (request) {
    // Sneak beforeId back in. This will tell the client
    // where to place the record, allowing for (maybe) repositioning
    if (typeof request.beforeId !== 'undefined') {
      request.record.beforeId = request.beforeId
    }
  }

  async implementDelete (request) {
    request.method = request.method || 'delete'
    request.inMethod = 'implementDelete'
    request.options = request.options || {}

    const id = request.params[this.idProperty]
    if (!id) throw new Error('request.params needs to contain idProperty for implementDelete')

    // Load the record, if it is not yet present in request as `record`
    if (!request.record) {
      request.record = await this.implementFetch(request) || null
    }
    request.body = {}
    request.originalBody = {}

    // Check for permissions
    const { granted, message } = await this.checkPermissions(request)
    if (!granted) throw new this.constructor.ForbiddenError(message)
  }

  async implementQuery (request) {
    request.method = request.method || 'getQuery'
    request.inMethod = 'implementQuery'

    // Don't allow options pollution. We can change the reference request.options
    // because requests are one-use only. However, the options object itself must
    // be left intact since it may not be single-use only
    // The sort object is also copied clean if passed through `options`
    request.options = request.options ? { ...request.options } : {}
    const actualSort = request.options.sort || this.defaultSort
    request.options.sort = actualSort ? { ...actualSort } : {}

    // Sanitise request.skip and request.limit
    // Limit is set in options, or the store-wide defaults defaultLimitOnQueries
    request.options.skip = request.options.skip || 0
    request.options.limit = request.options.limit || this.defaultLimitOnQueries

    // Validate the search schema
    const { validatedObject, errors } = await this.searchSchema.validate(request.options.conditionsHash, { onlyObjectValues: true })
    if (errors.length) throw new this.constructor.BadRequestError({ errors: errors })
    request.options.conditionsHash = validatedObject

    // Stubs to avoid 981313 empty checks later
    request.originalBody = {}
    request.body = {}
    request.record = {}

    // Check for permissions
    const { granted, message } = await this.checkPermissions(request)
    if (!granted) throw new this.constructor.ForbiddenError(message)
  }

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

    return await this.implementInsert(request) || { [this.idProperty]: request.body[this.idProperty] }
  }

  async _makePut (request) {
    // Check that the method is implemented
    if (!this.handlePut && request.remote) throw new Store.NotImplementedError()

    // Fetch the record
    // The fact that it's assigned to request.record means that
    // implementUpdate will use it without re-fetching
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
      return await this.implementInsert(request, 'put') || { [this.idProperty]: request.params[this.idProperty] }
    } else {
      // Execute actual DB operation
      return await this.implementUpdate(request, 'put') || { [this.idProperty]: request.params[this.idProperty] }
    }
  }

  async _makeGet (request) {
    // Check that the method is implemented
    if (!this.handleGet && request.remote) throw new Store.NotImplementedError()

    const record = await this.implementFetch(request)

    // Record not there: not found error!
    if (!record) throw new Store.NotFoundError()

    return record || { [this.idProperty]: request.params[this.idProperty] }
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
}
