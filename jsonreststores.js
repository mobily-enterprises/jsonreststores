/*
Copyright (C) 2019 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*
NOTE. When creating a store, you can take the following shortcuts:
  * Don't specify `paramIds`. If not specified, it will be worked out from publicURL
  * Don't specify `idProperty`. If idProperty not specified, it will be assumed last element of paramIds
  * Don't specify `paramIds` in schema. They will be added to the schema as `{type: 'id' }` automatically
  * Don't specify `searchSchema`. It will be worked out taking all schema element marked as `searchable: true` (except paramIds)
*/

const e = require('allhttperrors')
const path = require('path')

let registry = {}

const Store = exports = module.exports = class {
  // ****************************************************
  // *** ATTRIBUTES THAT CAN TO BE DEFINED IN PROTOTYPE
  // ****************************************************

  static get sortableFields () { return [] }
  static get publicURLprefix () { return null }
  static get publicURL () { return null } // Not mandatory (if you want your store to be API-only for some reason)

  static get schema () { return null }
  static get idProperty () { return null } // If not set, taken as last item of paramIds)
  static get paramIds () { return [] } // Only allowed if publicURL is not set
  static get searchSchema () { return null } // If not set, worked out from `schema` by constructor

  static get storeName () { return null }
  static get _singleFields () { return {} } // Fields that can be updated singularly
  static get emptyAsNull () { return true } // Fields that can be updated singularly

  static get artificialDelay () { return 0 } // Artificial delay

  static get beforeIdField () { return 'beforeId' } // Virtual field to place elements
  static get positionFilter () { return [] } // List of fields that will determine the subset

  // ****************************************************
  // *** ATTRIBUTES THAT DEFINE STORE'S BEHAVIOUR
  // ****************************************************

  static get handlePut () { return false }
  static get handlePost () { return false }
  static get handleGet () { return false }
  static get handleGetQuery () { return false }
  static get handleDelete () { return false }

  static get defaultSort () { return null } // If set, it will be applied to all getQuery calls
  static get defaultLimitOnQueries () { return 50 } //  Max number of records returned by default

  static get partial () { return false } //  A write will only affects the passed fields, not the whole record

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

  static get registry () { return registry }
  static set registry (r) { registry = r }
  static getStore (storeName) { return registry[storeName] }
  static deleteStore (storeName) { delete registry[storeName] }
  static getAllStores () { return registry }

  // Methods that MUST be implemented for the store to be functional

  // Input: request.params
  // Output: an object, or null
  async implementFetch (request) {
    throw (new Error('implementFetch not implemented, store is not functional'))
  }

  // Input: request.body, request.options.[placement,placementAfter]
  // Output: an object (saved record)
  async implementInsert (request) {
    throw (new Error('implementInsert not implemented, store is not functional'))
  }

  // Input:
  // - request.params (query)
  // - request.body (data)
  // - request.options.field (field name if it's a one-field update)
  // - request.options.[placement,placementAfter] (for record placement)
  // Output: an object (updated record)
  async implementUpdate (request, deleteUnsetFields) {
    throw (new Error('implementUpdate not implemented, store is not functional'))
  }

  // Input: request.params
  // Output: an object (deleted record)
  async implementDelete (request) {
    throw (new Error('implementDelete not implemented, store is not functional'))
  }

  // Input: request.params, request.options.[conditionsHash,ranges,sort]
  // Output: { data, total, grandTotal }
  async implementQuery (request) {
    throw (new Error('implementQuery not implemented, store is not functional'))
  }

  // ****************************************************
  // *** BEFORE AND AFTER HOOKS
  // ****************************************************

  async beforeCheckParamIds (request, method) { }
  async afterCheckParamIds (request, method) { }

  async beforeCheckPermissions (request, method) { }
  async afterCheckPermissions (request, method) { }

  async beforeValidate (request, method) { }
  async afterValidate (request, method) { }

  async beforeDbOperationWrite (request, method) { }
  async afterDbOperationWrite (request, method) { }

  async beforeDbOperationFetchOne (request, method) { }
  async beforeDbOperationQuery (request, method) { }
  async beforeDbOperationInsert (request, method) { }
  async beforeDbOperationUpdate (request, method) { }
  async beforeDbOperationDelete (request, method) { }

  async afterDbOperationFetchOne (request, method) { }
  async afterDbOperationQuery (request, method) { }
  async afterDbOperationInsert (request, method) { }
  async afterDbOperationUpdate (request, method) { }
  async afterDbOperationDelete (request, method) { }

  async beforeReturn (request, method) { }

  // ****************************************************
  // *** IMPORTANT IMPLEMENTATION HOOKS
  // ****************************************************

  async checkPermissions (request, method) { return { granted: true } }

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
    let k

    // Copy values over from the class' static values
    this.sortableFields = Constructor.sortableFields
    this.publicURLprefix = Constructor.publicURLprefix
    this.publicURL = Constructor.publicURL
    this.schema = Constructor.schema
    this.idProperty = Constructor.idProperty
    this.paramIds = Constructor.paramIds
    this.searchSchema = Constructor.searchSchema
    this.storeName = Constructor.storeName
    this.emptyAsNull = Constructor.emptyAsNull

    this.handlePost = Constructor.handlePost
    this.handlePut = Constructor.handlePut
    this.handleGet = Constructor.handleGet
    this.handleGetQuery = Constructor.handleGetQuery
    this.handleDelete = Constructor.handleDelete
    this.defaultSort = Constructor.defaultSort
    this.defaultLimitOnQueries = Constructor.defaultLimitOnQueries
    this.partial = Constructor.partial

    this.beforeIdField = this.constructor.beforeIdField
    this.positionField = this.constructor.positionField
    this.positionFilter = this.constructor.positionFilter

    // This will contain the single fields
    this._singleFields = {}

    // The store name must be defined
    if (this.storeName === null) {
      throw (new Error('You must define a store name for a store in constructor class'))
    }

    if (typeof (registry[this.storeName]) !== 'undefined') {
      throw new Error('Cannot instantiate two stores with the same name: ' + this.storeName)
    }

    // The schema must be defined
    if (this.schema == null) {
      throw (new Error('You must define a schema'))
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

    // By default, paramIds are set in schema as { type: 'id' } so that developers
    // can be lazy when defining their schemas
    for (let i = 0, l = this.paramIds.length; i < l; i++) {
      k = this.paramIds[i]
      if (typeof (this.schema.structure[k]) === 'undefined') {
        this.schema.structure[k] = { type: 'id' }
      }
    }

    // If onlineSearchSchema wasn't defined, then set it as a copy of the schema where
    // fields are `searchable`, EXCLUDING the paramIds fields.
    if (this.searchSchema == null) {
      const searchSchemaStructure = { }
      for (k in this.schema.structure) {
        if (this.schema.structure[k].searchable && this.paramIds.indexOf(k) === -1) {
          searchSchemaStructure[k] = this.schema.structure[k]
        }
      }
      this.searchSchema = new this.schema.constructor(searchSchemaStructure)
    }

    // Make up a hash of single fields
    for (k in this.schema.structure) {
      if (this.schema.structure[k].singleField) {
        this._singleFields[k] = this.schema.structure[k]
      }
    }

    Constructor.registry[this.storeName] = this
  }

  // Simple function that shallow-copies an object.
  _co (o) { return Object.assign({}, o) }

  getFullPublicURL () {
    // No prefix: return the publicURL straight
    if (!this.publicURLPrefix) return this.publicURL

    return path.join(this.publicURLPrefix, this.publicURL)
  }

  _lastParamId () {
    return this.paramIds[this.paramIds.length - 1]
  }

  _sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Check that paramsId are actually legal IDs using
  // paramsSchema.
  async _checkParamIds (request, skipIdProperty) {
    const fieldErrors = []

    // Params is empty: nothing to do, optimise a little
    if (request.params.length === 0) return

    // Check that ALL paramIds do belong to the schema
    this.paramIds.forEach((k) => {
      if (typeof (this.schema.structure[k]) === 'undefined') {
        throw new Error('This paramId must be in schema: ' + k)
      }
    })

    // If it's a remote request, check that _all_ paramIds are in params
    // (Local API requests can avoid passing paramIds)
    if (request.remote) {
      this.paramIds.forEach((k) => {
        // "continue" if id property is to be skipped
        if (skipIdProperty && k === this.idProperty) return

        // Required paramId not there: puke!
        if (typeof (request.params[k]) === 'undefined') {
          fieldErrors.push({ field: k, message: 'Field required in the URL: ' + k })
        }
      })
      // If one of the key fields was missing, puke back
      if (fieldErrors.length) throw new Store.BadRequestError({ errors: fieldErrors })
    }

    // Prepare skipParams and skipCast, depending on skipIdProperty
    const skipFields = []
    if (skipIdProperty) {
      skipFields.push(this.idProperty)
    }

    // Validate request.params
    const { validatedObject, errors } = await this.schema.validate(request.params, { onlyObjectValues: true, skipFields })
    if (errors.length) throw new Store.BadRequestError({ errors: errors })

    request.params = validatedObject
  }

  _enrichBodyWithParamIdsIfRemote (request) {
    if (request.remote) {
      this.paramIds.forEach((paramId) => {
        if (typeof (request.params[paramId]) !== 'undefined') {
          request.body[paramId] = request.params[paramId]
        }
      })
    }
  }

  async _makePost (request) {
    // Default request.doc to null; it will only have a real value
    // very late in the game, after the insert
    request.doc = null

    // Check that the method is implemented
    if (!this.handlePost && request.remote) throw new Store.NotImplementedError()

    // Check the IDs
    await this.beforeCheckParamIds(request, 'post')
    await this._checkParamIds(request, true)
    await this.afterCheckParamIds(request, 'post')

    // Add paramIds to body
    this._enrichBodyWithParamIdsIfRemote(request)

    // Run validation, throw an error if it fails
    await this.beforeValidate(request, 'post')
    const { validatedObject, errors } = await this.schema.validate(request.body, { emptyAsNull: !!this.emptyAsNull, skipFields: [this.idProperty] })
    request.bodyBeforeValidation = request.body
    request.body = validatedObject
    if (errors.length) throw new Store.UnprocessableEntityError({ errors: errors })
    await this.afterValidate(request, 'post')

    // Check permissions
    if (request.remote) {
      await this.beforeCheckPermissions(request, 'post')
      const { granted, message } = await this.checkPermissions(request, 'post')
      if (!granted) throw new Store.ForbiddenError(message)
      await this.afterCheckPermissions(request, 'post')
    }

    await this.beforeDbOperationWrite(request, 'post')

    // Execute actual DB operation
    await this.beforeDbOperationInsert(request, 'post')
    request.doc = await this.implementInsert(request, 'post') || null
    await this.afterDbOperationInsert(request, 'post')

    // Run the generic "afterDbOperationWrite" hook
    await this.afterDbOperationWrite(request, 'post')

    // Send over to the client
    await this.beforeReturn(request, 'post')
    return request.doc
  }

  async _makePut (request) {
    // Check that the method is implemented
    if (!this.handlePut && !request.options.field && request.remote) throw new Store.NotImplementedError()

    // Default request.doc to null; it will only have a real value once
    // a record is loaded (if it is)
    if (request.putNew) request.doc = null

    // Check the IDs
    await this.beforeCheckParamIds(request, 'put')
    await this._checkParamIds(request)
    await this.afterCheckParamIds(request, 'put')

    // Add paramIds to body
    this._enrichBodyWithParamIdsIfRemote(request)

    // Run validation, throw an error if it fails
    await this.beforeValidate(request, 'put')
    const { validatedObject, errors } = await this.schema.validate(request.body, {
      emptyAsNull: this.emptyAsNull,
      onlyObjectValues: request.options.field || request.options.partial || this.partial
    })
    request.bodyBeforeValidation = request.body
    request.body = validatedObject
    if (errors.length) throw new Store.UnprocessableEntityError({ errors: errors })
    await this.afterValidate(request, 'put')

    // Fetch the record
    await this.beforeDbOperationFetchOne(request, 'put')
    request.doc = await this.implementFetch(request, 'put') || null
    await this.afterDbOperationFetchOne(request, 'put')

    request.putNew = !request.doc
    request.putExisting = !!request.doc

    // Check permissions
    if (request.remote) {
      await this.beforeCheckPermissions(request, 'put')
      const { granted, message } = await this.checkPermissions(request, 'put')
      if (!granted) throw new Store.ForbiddenError(message)
      await this.afterCheckPermissions(request, 'put')
    }

    // Check the 'overwrite' option, throw if fail
    if (typeof request.options.overwrite !== 'undefined') {
      if (request.doc && !request.options.overwrite) {
        throw new this.PreconditionFailedError()
      } else if (!request.doc && request.options.overwrite) {
        throw new this.PreconditionFailedError()
      }
    }

    // Run the generic "beforeDbOperationWrite" hook
    await this.beforeDbOperationWrite(request, 'put')

    if (request.putNew) {
      //
      // It cannot be a new doc and have "single field" set, since
      // the single-field put is supposed to only ever be used on existing
      // records
      if (request.options.field) {
        throw new Store.UnprocessableEntityError('Field update only allowed on existing records')
      }

      // Execute actual DB operation
      await this.beforeDbOperationInsert(request, 'put')
      request.doc = await this.implementInsert(request, 'put') || null
      await this.afterDbOperationInsert(request, 'put')
    } else {
      // Execute actual DB operation
      await this.beforeDbOperationUpdate(request, 'put')
      request.doc = await this.implementUpdate(request, 'put') || null
      await this.afterDbOperationUpdate(request, 'put')
    }

    // Run the generic "afterDbOperationWrite" hook
    await this.afterDbOperationWrite(request, 'put')

    // Send over to the client
    await this.beforeReturn(request, 'put')
    return request.doc
  }

  async _makeGet (request) {
    // This is the 'doc' as such
    request.doc = null

    // Check that the method is implemented
    if (!this.handleGet && request.remote) throw new Store.NotImplementedError()

    // Check the IDs
    await this.beforeCheckParamIds(request, 'get')
    await this._checkParamIds(request, true)
    await this.afterCheckParamIds(request, 'get')

    // Execute actual DB operation
    await this.beforeDbOperationFetchOne(request, 'get')
    request.doc = await this.implementFetch(request, 'get') || null
    await this.afterDbOperationFetchOne(request, 'get')

    // Record not there: not found error!
    if (!request.doc) throw new Store.NotFoundError()

    // Check permissions
    if (request.remote) {
      await this.beforeCheckPermissions(request, 'get')
      const { granted, message } = await this.checkPermissions(request, 'get')
      if (!granted) throw new Store.ForbiddenError(message)
      await this.afterCheckPermissions(request, 'get')
    }

    // Send over to the client
    await this.beforeReturn(request, 'get')
    return request.doc
  }

  async _makeGetQuery (request) {
    // This is the 'doc' as such
    request.docs = null

    // Check that the method is implemented
    if (!this.handleGetQuery && request.remote) throw new Store.NotImplementedError()

    // Check the IDs
    await this.beforeCheckParamIds(request, 'getQquery')
    await this._checkParamIds(request, true)
    await this.beforeCheckParamIds(request, 'getQuery')

    // Validate the search schema
    const { validatedObject, errors } = await this.searchSchema.validate(request.options.conditionsHash, { onlyObjectValues: true })
    if (errors.length) throw new Store.BadRequestError({ errors: errors })

    request.options.conditionsHash = validatedObject

    // Check permissions
    if (request.remote) {
      await this.beforeCheckPermissions(request, 'getQuery')
      const { granted, message } = await this.checkPermissions(request, 'getQuery')
      if (!granted) throw new Store.ForbiddenError(message)
      await this.afterCheckPermissions(request, 'getQuery')
    }

    // Execute actual DB operation
    await this.beforeDbOperationQuery(request, 'getQuery')
    const { data, grandTotal } = await this.implementQuery(request, 'getQuery') || { data: [], grandTotal: 0 }
    request.docs = data || []
    request.total = data.length
    if (typeof grandTotal !== 'undefined') request.grandTotal = grandTotal
    await this.afterDbOperationQuery(request, 'getQuery')

    // Send over to the client
    await this.beforeReturn(request, 'getQuery')
    return request.docs
  }

  async _makeDelete (request) {
    // This is the 'doc' as such
    request.doc = null

    // Check that the method is implemented
    if (!this.handleDelete && request.remote) throw new Store.NotImplementedError()

    // Check the IDs
    await this.beforeCheckParamIds(request, 'delete')
    await this._checkParamIds(request, true)
    await this.beforeCheckParamIds(request, 'delete')

    // Fetch the record
    await this.beforeDbOperationFetchOne(request, 'delete')
    request.doc = await this.implementFetch(request, 'delete') || null
    await this.afterDbOperationFetchOne(request, 'delete')

    // Record not there: not found error!
    if (!request.doc) throw new Store.NotFoundError()

    // Check permissions
    if (request.remote) {
      await this.beforeCheckPermissions(request, 'delete')
      const { granted, message } = await this.checkPermissions(request, 'delete')
      if (!granted) throw new Store.ForbiddenError(message)
      await this.afterCheckPermissions(request, 'delete')
    }

    await this.beforeDbOperationWrite(request, 'put')

    // Execute actual DB operation
    await this.beforeDbOperationDelete(request, 'delete')
    await this.implementDelete(request, 'delete')
    await this.afterDbOperationDelete(request, 'delete')

    // Run the generic "afterDbOperationWrite" hook
    await this.afterDbOperationWrite(request, 'delete')

    // Send over to the client
    await this.beforeReturn(request, 'delete')
    return request.doc
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
    request.options = this._co(options)

    this._makeGetQuery(request)
  }

  apiGet (id, options) {
    options = options || {}

    // Make up the request
    const request = {}
    request.remote = false
    request.options = options
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
    request.options = options
    request.body = this._co(body)
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
    request.options = options
    request.params = options.apiParams || {}
    request.session = options.session || {}
    request.body = this._co(body)

    // Actually run the request
    this._makePost(request)
  }

  apiDelete (id, options, next) {
    options = options || {}

    // Make up the request
    const request = {}
    request.body = {}
    request.options = options
    if (options.apiParams) request.params = options.apiParams
    else { request.params = {}; request.params[this.idProperty] = id }
    request.session = options.session || {}

    // Actually run the request
    this._makeDelete(request, next)
  }
}
