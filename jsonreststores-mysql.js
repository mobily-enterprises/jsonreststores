/*
Copyright (C) 2016 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*
* Don't specify `paramIds` in schema. They will be added to the schema as `{type: 'id' }` automatically
* Don't specify `searchSchema`. It will be worked out taking all schema element marked as `searchable: true` (except paramIds)

* [SimpleSchema - Github](https://github.com/mercmobily/SimpleSchema). This module makes it easy (and I mean, really easy) to define a schema and validate/cast data against it. It's really simple to extend a schema as well. It's a no-fuss module.

# A database-driven JSON REST store

Creating a store with JsonRestStores is very simple. Here is code that can be plugged directly into an Express application:

    var Store = require('jsonreststores2') // The main JsonRestStores module
    var HTTPMixin = require('jsonreststores2/HTTPMixin') // HTTP Mixin
    var Schema = require('simpleschema2')  // The main schema module

    // This is for MySql
    var promisify = require('util').promisify
    var mysql = require('mysql')

    // ======= BEGIN: Normally in separate file in production =============
    // Create MySql connection. NOTE: in production this will likely be placed
    // in a separate file, so that `connection` can be required and shared...
    var connection = mysql.createPool({
      host: 'localhost',
      user: 'user',
      password: 'YOUR PASSOWORD',
      database: 'testing',
      port: 3306
    })
    // Promisified versions of the query function for MySql
    connection.queryP = promisify(connection.query)
    // ======= END: Normally in separate file in production =============

    // Make up an object that will contain all of the stores
    var stores = {}

    // Basic definition of the managers store
    class Managers extends HTTPMixin(Store) {
      static get schema () {
        return new Schema({
          name: { type: 'string', trim: 60 },
          surname: { type: 'string', searchable: true, trim: 60 }
        })
      }

      static get storeName () { return 'managers' }
      static get publicURL () { return '/managers/:id' }

      static get handlePut () { return true }
      static get handlePost () { return true }
      static get handleGet () { return true }
      static get handleGetQuery () { return true }
      static get handleDelete () { return true }

      async implementFetch (request) {
        return (await connection.queryP('SELECT * FROM managers WHERE id = ?', request.params.id))[0]
      }

      async implementInsert (request) {
        let insertResults = await connection.queryP('INSERT INTO managers SET ?', request.body)
        let selectResults = await connection.queryP('SELECT * FROM managers WHERE id = ?', insertResults.insertId)
        return selectResults[0] || null
      }

      async implementUpdate (request) {
        await connection.queryP('UPDATE managers SET ? WHERE id = ?', [request.body, request.params.id])
        return (await connection.queryP('SELECT * FROM managers WHERE id = ?', request.params.id))[0]
      }

      async implementDelete (request) {
        let record = (await connection.queryP('SELECT * FROM managers WHERE id = ?', request.params.id))[0]
        await connection.queryP('DELETE FROM managers WHERE id = ?', [request.params.id])
        return record
      }

      async implementQuery (request) {
        var result = await connection.queryP(`SELECT * FROM managers LIMIT ?,?`, [ request.options.ranges.skip, request.options.ranges.limit ])
        var grandTotal = (await connection.queryP(`SELECT COUNT (*) as grandTotal FROM managers`))[0].grandTotal
        return { data: result, grandTotal: grandTotal }
      }
    }

    stores.managers = new Managers()
    exports = module.exports = stores

In app.js, after `app.use(express.static)`, you would have:

    var stores = require('./stores.js');
    stores.managers.protocolListenHTTP({app: app});

You will also need to create your MySql table in the 'testing' database:

    CREATE TABLE managers (
      id INT(10) PRIMARY KEY NOT NULL AUTO_INCREMENT,
      name VARCHAR(60),
      surname VARCHAR(60)
    );

That's it: this is enough to add, to your Express application, a full store which will handle properly all of the HTTP calls.
Note that the database side of things has no sanity check: that's because sanity checking has _already_ happened at this stage.

Also note that this setup will query a MySql database; however, _anything_ can be the source of data.

Note that:

* `Managers` is a new constructor function that inherits from `Store` (the main constructor for JSON REST stores) mixed in with `HTTPMixin` (which implements `protocolListenHTTP()`
* `schema` is an object of type Schema that will define what's acceptable in a REST call.
* `publicURL` is the URL the store is reachable at. ***The last one ID is the most important one***: the last ID in `publicURL` (in this case it's also the only one: `id`) defines which field, within your schema, will be used as _the_ record ID when performing a PUT and a GET (both of which require a specific ID to function).
* `storeName` (_mandatory_) needs to be a unique name for your store.
* `handleXXX` are attributes which will define how your store will behave. If you have `handlePut: false` and a client tries to PUT, they will receive an `NotImplemented` HTTP error.
* `protocolListen( 'HTTP', { app: app } )` creates the right Express routes to receive HTTP connections for the `GET`, `PUT`, `POST` and `DELETE` methods.

## The store in action

A bit of testing with `curl`:

    $ curl -i -XGET  http://localhost:3000/managers/
    HTTP/1.1 200 OK
    X-Powered-By: Express
    Content-Type: application/json; charset=utf-8
    Content-Length: 2
    ETag: "223132457"
    Date: Mon, 02 Dec 2013 02:20:21 GMT
    Connection: keep-alive

    []

    curl -i -X POST -d "name=Tony&surname=Mobily"  http://localhost:3000/managers/
    HTTP/1.1 201 Created
    X-Powered-By: Express
    Location: /managers/2
    Content-Type: application/json; charset=utf-8
    Content-Length: 54
    Date: Mon, 02 Dec 2013 02:21:17 GMT
    Connection: keep-alive

    {
      "id": 2,
      "name": "Tony",
      "surname": "Mobily"
    }

    curl -i -X POST -d "name=Chiara&surname=Mobily"  http://localhost:3000/managers/
    HTTP/1.1 201 Created
    X-Powered-By: Express
    Location: /managers/4
    Content-Type: application/json; charset=utf-8
    Content-Length: 54
    Date: Mon, 02 Dec 2013 02:21:17 GMT
    Connection: keep-alive

    {
      "id": 4,
      "name": "Chiara",
      "surname": "Mobily"
    }

    $ curl -i -GET  http://localhost:3000/managers/
    HTTP/1.1 200 OK
    X-Powered-By: Express
    Content-Type: application/json; charset=utf-8
    Content-Length: 136
    ETag: "1058662527"
    Date: Mon, 02 Dec 2013 02:22:29 GMT
    Connection: keep-alive

    [
      {
        "id": 2,
        "name": "Tony",
        "surname": "Mobily"
      },
      {
        "id": 4,
        "name": "Chiara",
        "surname": "Mobily"
      }
    ]

    $ curl -i -X PUT -d "name=Merc&surname=Mobily"  http://localhost:3000/managers/2
    HTTP/1.1 200 OK
    X-Powered-By: Express
    Location: /managers/2
    Content-Type: application/json; charset=utf-8
    Content-Length: 54
    Date: Mon, 02 Dec 2013 02:23:50 GMT
    Connection: keep-alive

    {
      "id": 2,
      "name": "Merc",
      "surname": "Mobily"
    }

    $ curl -i -XGET  http://localhost:3000/managers/2
    HTTP/1.1 200 OK
    X-Powered-By: Express
    Content-Type: application/json; charset=utf-8
    Content-Length: 54
    ETag: "-264833935"
    Date: Mon, 02 Dec 2013 02:24:58 GMT
    Connection: keep-alive

    {
      "id": 2,
      "name": "Merc",
      "surname": "Mobily"
    }

It all works!

-------------------------------------

## Custom `searchSchema`

In JsonRestStores you actually define what fields are acceptable as filters in `implementQuery` (specifically, `request.options.conditions`) with the property `searchSchema`, which is defined exactly as a schema. So, writing this is equivalent to the code just above:

    // Basic definition of the managers store
    class Managers extends HTTPMixin(Store) {
      static get schema () {
        return new Schema({
          name: { type: 'string', trim: 60 },
          surname: { type: 'string', searchable: true, trim: 60 }
        })
      }

      searchSchema: new Schema( {
        surname: { type: 'string', trim: 60 },
      }),

      static get storeName () { return 'managers' }
      static get publicURL () { return '/managers/:id' }

      static get handlePut () { return true }
      static get handlePost () { return true }
      static get handleGet () { return true }
      static get handleGetQuery () { return true }
      static get handleDelete () { return true }

      // ...implement??? functions
    }

If `searchSchema` is not defined, JsonRestStores will create one based on your main schema by doing a shallow copy, excluding `paramIds` (which means that, in this case, `id` is not added automatically to `searchSchema`, which is most likely what you want).

If you define your own `searchSchema`, you are able to decide exactly how you want to filter the values. For example you could define a different default, or trim value, etc. You might also have fields that will create more complex queries. For example:

    // Basic definition of the managers store
    class Managers extends HTTPMixin(Store) {
      static get schema () {
        return new Schema({
          name: { type: 'string', searchable: true, trim: 60 },
          surname: { type: 'string', searchable: true, trim: 60 }
        })
      }

      searchSchema: new Schema( {
        surname: { type: 'string', trim: 60 },
        name: { type: 'string', trim: 60 },
        anyField: { type: string, trim: 60 }
      }),

      static get storeName () { return 'managers' }
      static get publicURL () { return '/managers/:id' }

      static get handlePut () { return true }
      static get handlePost () { return true }
      static get handleGet () { return true }
      static get handleGetQuery () { return true }
      static get handleDelete () { return true }

      async implementQuery (request) {
        // request.options.conditions might have 'any', which should generate
        // an SQL query checking both name and surname
      }

      // ...implement??? functions
    }

----------------------------------------------

# Permissions

Every rest method runs `checkPermissions()` in order to check permissions. If everything is fine, `checkPermissions()`  returns `true`; if it returns `false`, along with a message, it means that permission wasn't granted.

The `checkPermissions()` method has the following signature:

    checkPermissions: function( request, method)

Here:

* `request`. It is the request object
* `method`. It can be `post`, `put`, `get`, `getQuery`, `delete`

Here is an example of a store only allowing deletion only to specific admin users:

Note that if your store is derived from another one, and you want to preserve the parent store's permission model, you can run `super.checkPermissions()`:

      async checkPermissions (request, method) {

        // Run the parent's permission check. If it failed, honour the failure
        let { granted, message } = super.checkPermissions(request, method)
        if (!granted) return { granted: true }

        // We are only adding checks for  `put`.
        // In any other case, will go along with the parent's response
        if (method === 'put') return { granted: true }

        // User is admin (id: 1 )
        if( request.session.user === 1){ return { granted: true }
        else return { granted: false, message: 'Only admin can do this'}
      },

Please note that `checkPermissions()` is only run for local requests, with `remote` set to false. All requests coming from APIs will ignore the method.

-----------------------------------------------

## A note on `publicURL` and `paramIds`

When you define a store like this:

    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', trim: 60 },
      }),

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      hardLimitOnQueries: 50,
    });

    managers.protocolListen( 'HTTP', { app: app } );;

The `publicURL` is used to:

* Add `id: { type: id }` to the schema automatically. This is done so that you don't have to do the grunt work of defining `id` in the schema if they are already in `publicURL`.
* Create the `paramIds` array for the store. In this case, `paramIds` will be `[ 'id' ]`.

So, you could reach the same goal without `publicURL`:

    // Basic definition of the managers store
    class Managers extends HTTPMixin(Store) {
      static get schema () {
        return new Schema({
          id: { type: 'id' },
          name: { type: 'string', searchable: true, trim: 60 },
          surname: { type: 'string', trim: 60 }
        })
      }

      static get paramIds () { return [ 'id' ] }

      static get storeName () { return 'managers' }
      static get publicURL () { return '/managers/:id' }

      static get handlePut () { return true }
      static get handlePost () { return true }
      static get handleGet () { return true }
      static get handleGetQuery () { return true }
      static get handleDelete () { return true }
      // ...implement??? functions
    }

Note that:
 * The `id` parameter had to be defined in the schema
 * The `paramIds` array had to be defined by hand
 * `managers.protocolListenHTTP({ app: app } );` can't be used as the public URL is not there

In any case, the property `idProperty` is set as last element of `paramIds`; in this example, it is `id`.

*/

/*
  Schema options
    * searchable (added to searchSchema automatically if searchSchema not set)
    * silent (not fetched in query and fetch if true)
*/
const Mixin = (superclass) => class extends superclass {
  //
  // Hooks to inject code in workflow
  async beforeValidate (request) { }
  async validate (request) { return [] }
  async checkPermissions (request) { return { granted: true } }
  async transformResult (request, op, recordOrSet) { return null }

  static get connection () { return null }
  static get table () { return null }

  static get sortableFields () { return [] }
  static get schema () { return null }
  static get searchSchema () { return null } // If not set, worked out from `schema` by constructor
  static get emptyAsNull () { return true } // Fields that can be updated singularly
  static get beforeIdField () { return 'beforeId' } // Virtual field to place elements
  static get positionFilter () { return [] } // List of fields that will determine the subset
  static get defaultSort () { return null } // If set, it will be applied to all getQuery calls
  static get fullRecordOnUpdate () { return false } //  A write will only affects the passed fields, not the whole record
  static get fullRecordOnInsert () { return true } //  A write will only affects the passed fields, not the whole record

  constructor () {
    super()
    const Constructor = this.constructor

    const promisify = require('util').promisify

    this.sortableFields = Constructor.sortableFields
    this.schema = Constructor.schema
    this.searchSchema = Constructor.searchSchema
    this.emptyAsNull = Constructor.emptyAsNull
    this.defaultSort = Constructor.defaultSort
    this.fullRecordOnInsert = Constructor.fullRecordOnInsert
    this.fullRecordOnUpdate = Constructor.fullRecordOnUpdate
    this.beforeIdField = this.constructor.beforeIdField
    this.positionField = this.constructor.positionField
    this.positionFilter = this.constructor.positionFilter

    this.connection = this.constructor.connection
    this.connection.queryP = promisify(this.connection.query)
    this.table = this.constructor.table

    // The schema must be defined
    if (this.schema == null) {
      throw (new Error('You must define a schema'))
    }

    // By default, paramIds are set in schema as { type: 'id' } so that developers
    // can be lazy when defining their schemas
    // SIDE_EFFECT: schema.structure changed
    let k
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
  }

  // SIDE EFFECT: record
  cleanup (record) {
    const r = Object.assign({}, record)
    for (const k in r) {
      if (typeof this.schema.structure[k] === 'undefined') delete r[k]
    }
    return r
  }

  // **************************************************
  // HELPER FUNCTIONS NEEDED BY ALL implement*() CALLS
  // **************************************************

  _checkVars () {
    if (!this.connection) throw new Error('The static property "connection" must be set')
    if (!this.table) throw new Error('The static property "table" must be set')
  }

  _paramsConditions (request) {
    const paramsConditions = []
    const paramsArgs = []

    for (const param in request.params) {
      paramsConditions.push(`\`${this.table}\`.\`${param}\` = ?`)
      paramsArgs.push(request.params[param])
    }

    return { paramsConditions, paramsArgs }
  }

  // **************************************************
  // QUERY BUILDER
  // **************************************************

  schemaFields () {
    const l = []

    // Return all fields from the schema that are not marked as "silent"
    for (const k in this.schema.structure) {
      // Skip fields marked as "silent" in schema
      if (this.schema.structure[k].silent) continue

      // Add field with table name, and correct escaping
      l.push(`\`${this.table}\`.\`${k}\``)
    }
    return l
  }

  async queryBuilder (request, op, param) {
    switch (op) {
      //
      // GET
      case 'fetch':
        switch (param) {
          case 'fieldsAndJoins':
            return {
              fields: this.schemaFields(),
              joins: []
            }
          case 'conditionsAndArgs':
            return {
              conditions: [],
              args: []
            }
        }
        break

      //
      // DELETE
      case 'delete':
        switch (param) {
          case 'tablesAndJoins':
            return {
              tables: [this.table],
              joins: []
            }
          case 'conditionsAndArgs':
            return {
              conditions: [],
              args: []
            }
        }
        break

      // QUERY
      case 'query':
        switch (param) {
          case 'fieldsAndJoins':
            return {
              fields: this.schemaFields(),
              joins: []
            }
          case 'conditionsAndArgs':
            return this._optionsConditionsAndArgs(request)
        }
        break

      // UPDATE
      case 'update':
        switch (param) {
          case 'updateObject':
            return request.body
          case 'joins':
            return []
          case 'conditionsAndArgs':
            return {
              conditions: [],
              args: []
            }
        }
        break

      // INSERT
      case 'insert':
        switch (param) {
          case 'insertObject':
            return request.body
        }
        break
      // SORT
      case 'sort':
        return this._optionsSort(request)
    }
  }

  // ********************************************************************
  // HELPER FUNCTIONS NEEDED BY implementInsert() AND implementUpdate()
  // ********************************************************************

  // Make sure the positionField is updated depending on beforeID passed:
  // undefined    => leave it where it was (if it had a position) or place it last (if it didn't have a position)
  // null         => place it last
  // number       => valid record   => place it before that record, "making space"
  //              => INvalid record => place it last
  //
  // SIDE_EFFECT: body[this.positionField]
  async _calculatePosition (request) {
    //
    //
    const _positionFiltersFieldsSame = (request) => {
      // If there is no original request.record, there is nothing to check
      if (!request.record) return true

      // Check whether the positionFilter fields have changed.
      // Note that it's a soft `!=` comparison since the way data is stored on the DB
      // might be different to what is passed. This assumes that DB and JS will have
      // compatible results
      for (const k of this.positionFilter) {
        if (typeof request.body[k] !== 'undefined' && typeof request.record[k] !== 'undefined') {
          if (request.body[k] != request.record[k]) return false // eslint-disable-line
        }
      }
      return true
    }

    // This function will be called a lot in case the record is to be placed last.
    // It has side-effects (it changes request.body AND it changes the DB)
    const last = async () => {
      request.body[this.positionField] = (await this.connection.queryP(`SELECT max(${this.positionField}) as maxPosition FROM ${this.table} WHERE ${wherePositionFilter}`, positionQueryArgs))[0].maxPosition + 1
    }

    // No position field: exit right away
    if (typeof this.positionField === 'undefined') return

    // Work really hard to find out what the previous position was
    // Note: request.record might be empty even in case of update in case
    // of usage via API (implementUpdate() with dummy/incomplete request)
    let prevPosition
    if (request.record) prevPosition = request.record[this.positionField]
    else {
      if (request.params && typeof request.params[this.idProperty] !== 'undefined') {
        const r = (await this.connection.queryP(`SELECT ${this.positionField} FROM ${this.table} WHERE ${this.table}.${this.idProperty} = ?`, [request.params[this.idProperty]]))[0]
        if (r) prevPosition = r[this.positionField]
      }
    }

    const positionQueryArgs = []
    let wherePositionFilter
    if (this.positionFilter.length === 0) wherePositionFilter = '1 = 1'
    else {
      const source = request.record || request.body
      const r = []
      for (const k of this.positionFilter) {
        if (source[k] === null || typeof source[k] === 'undefined') {
          r.push(`(${k} is NULL)`)
        } else {
          r.push(`(${k} = ?)`)
          positionQueryArgs.push(source[k])
        }
      }
      wherePositionFilter = ' ' + r.join(' AND ') + ' '
    }

    // If ANY of the positionFilters have changed, it will go
    // last, end of story (since "position 2" might mean something different)
    //
    // This is because generally proper repositioning will only happen with Drag&drop and
    // therefore changing positio fields would be strange.
    // On the other hand, if a field is soft-deleted, it will need to have its
    // place reset since its position makes no sense in the new "group"
    if (!_positionFiltersFieldsSame(request)) {
      await last()
    }

    // undefined    => leave it where it was (if it had a position) or place it last (if it didn't have a position)
    else if (typeof request.beforeId === 'undefined') {
      if (!prevPosition) await last()
      else request.body[this.positionField] = prevPosition

    // null         => place it last
    } else if (request.beforeId === null) {
      await last()

    // number       => valid record   => place it before that record, overwriting previous position
    //                 Invalid record => place it last
    } else {
      const beforeIdItem = (await this.connection.queryP(`SELECT ${this.table}.${this.idProperty}, ${this.positionField} FROM ${this.table} WHERE ${this.table}.${this.idProperty} = ? AND ${wherePositionFilter}`, [request.beforeId, ...positionQueryArgs]))[0]

      // number       => valid record   => place it before that record, "making space"
      if (beforeIdItem) {
        await this.connection.queryP(`UPDATE ${this.table} SET ${this.positionField} = ${this.positionField} + 1 WHERE ${this.positionField} >= ?  AND ${wherePositionFilter} ORDER BY ${this.positionField} DESC`, [beforeIdItem[this.positionField] || 0, ...positionQueryArgs])
        request.body[this.positionField] = beforeIdItem[this.positionField]
      //              => INvalid record => place it last
      } else {
        await last()
      }
    }
  }

  // Check that paramsId are actually legal IDs using
  // paramsSchema.
  async _validateParams (request, skipIdProperty) {
    const fieldErrors = []

    // Params is empty: nothing to do, optimise a little
    if (request.params.length === 0) return

    // Check that _all_ paramIds are in params
    // (Direct requests don't use URL, so check)
    this.paramIds.forEach((k) => {
      // "continue" if id property is to be skipped
      if (skipIdProperty && k === this.idProperty) return

      // Required paramId not there: puke!
      if (typeof (request.params[k]) === 'undefined') {
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

    // Validate request.params
    const { validatedObject, errors } = await this.schema.validate(request.params, { onlyObjectValues: true, skipFields })
    if (errors.length) throw new this.constructor.BadRequestError({ errors: errors })

    return validatedObject
  }

  _enrichBodyWithParamIds (request) {
    // SIDE_EFFECT: body[paramId]
    this.paramIds.forEach((paramId) => {
      if (typeof (request.params[paramId]) !== 'undefined') {
        request.body[paramId] = request.params[paramId]
      }
    })
  }

  implementInsertSql (joins) {
    const updateString = 'INSERT INTO'
    return `${updateString} \`${this.table}\` SET ?`
  }

  // Input:
  // - request.body
  // - request.options.[placement,placementAfter] (for record placement)
  // Output: an object (saved record)
  //
  // SIDE_EFFECT:
  //   request.body[beforeIdField]
  //   request.params (whole object replaced by _validateParams)
  //   request.body (with paramIds)
  async implementInsert (request) {
    this._checkVars()

    if (this.positionField) {
      request.beforeId = request.body[this.beforeIdField]
      delete request.body[this.beforeIdField]
    }

    // This uses request.options.[placement,placementAfter]
    await this._calculatePosition(request)

    // validateParam
    request.params = await this._validateParams(request)

    // Add paramIds to body
    this._enrichBodyWithParamIds(request)

    // This is an important hook as developers might want to
    // manipulate request.body before validation (e.g. non-schema custom fields)
    // or manipulate the request itself
    await this.beforeValidate(request)

    // Validate input. This is light validation.
    const { validatedObject, errors } = await this.schema.validate(request.body, {
      emptyAsNull: request.options.emptyAsNull || this.emptyAsNull,
      onlyObjectValues: !request.options.fullRecordOnInsert || !this.fullRecordOnInsert
    })

    // Check for permissions
    const { granted, message } = await this.checkPermissions(request, validatedObject, {})
    if (!granted) throw new this.constructor.ForbiddenError(message)

    // Call the validate hook. This will carry more expensive validation once
    // permissions are granted
    const allErrors = { ...errors, ...await this.validate(request, errors) }
    if (allErrors.length) throw new this.constructor.UnprocessableEntityError({ errors: allErrors })

    // Work out the insert object
    const insertObject = await this.queryBuilder(request, 'insert', 'insertObject')

    // Run the query
    const query = await this.implementInsertSql()

    // Perform the update
    // The ID will be in insertResult.insertId
    const insertResult = await this.connection.queryP(query, [insertObject])

    // After insert: post-processing of the record
    await this.queryBuilder(request, 'insert', 'after')

    // Make up a bogus request (just with request.params using insertId)
    // to re-fetch the record and return it
    // NOTE: request.params is all implementFetch uses
    const bogusRequest = { options: {}, session: request.session, params: { [this.idProperty]: insertResult.insertId } }
    const record = await this.implementFetch(bogusRequest)

    return record
  }

  implementUpdateSql (joins, conditions) {
    const updateString = 'UPDATE'
    const whereString = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    return `${updateString} \`${this.table}\` SET ? ${whereString} `
  }

  // Input:
  // - request.params (query)
  // - request.body (data)
  // - request.options.[placement, placementAfter] (for record placement)
  // Output: an object (updated record, refetched)
  //
  // SIDE_EFFECT:
  //   request.record (created)
  //   request.body[beforeIdField] (maybe deleted)
  //   request.params (whole object replaced by _validateParams())
  //   request.body (added paramIds)
  async implementUpdate (request) {
    this._checkVars()

    if (this.positionField) {
      request.beforeId = request.body[this.beforeIdField]
      delete request.body[this.beforeIdField]
    }

    // This uses request.options.[placement,placementAfter]
    await this._calculatePosition(request)

    // validateParam
    request.params = await this._validateParams(request)

    const id = request.params[this.idProperty]
    if (!id) throw new Error('request.params needs to contain idProperty for implementUpdate')

    // Add paramIds to body
    this._enrichBodyWithParamIds(request)

    // Load the record, if it is not yet present in request as `record`
    let record
    if (request.record) {
      record = request.record
    } else {
      // Fetch the record
      record = await this.implementFetch(request) || null
    }

    // This is an important hook as developers might want to
    // manipulate request.body before validation (e.g. non-schema custom fields)
    // or manipulate the request itself
    await this.beforeValidate(request)

    // Validate input. This is light validation.
    const { validatedObject, errors } = await this.schema.validate(request.body, {
      emptyAsNull: request.options.emptyAsNull || this.emptyAsNull,
      onlyObjectValues: !request.options.fullRecordOnUpdate || !this.fullRecordOnUpdate,
      record: record
    })

    // Check for permissions
    const { granted, message } = await this.checkPermissions(request, validatedObject, record)
    if (!granted) throw new this.constructor.ForbiddenError(message)

    // Call the validate hook. This will carry more expensive validation once
    // permissions are granted
    const allErrors = { ...errors, ...await this.validate(request, errors) }
    if (allErrors.length) throw new this.constructor.UnprocessableEntityError({ errors: allErrors })

    // Make up the crucial variables for the update: object, joins, and conditions/args
    const updateObject = await this.queryBuilder(request, 'update', 'updateObject')
    const joins = await this.queryBuilder(request, 'update', 'joins')
    let { conditions, args } = await this.queryBuilder(request, 'update', 'conditionsAndArgs')

    const { paramsConditions, paramsArgs } = this._paramsConditions(request)

    // Add mandatory conditions dictated by the passed params
    conditions = conditions.concat(paramsConditions)
    args = args.concat(paramsArgs)

    // Run the query
    const query = await this.implementUpdateSql(joins, conditions)

    // Perform the update
    await this.connection.queryP(query, [updateObject, ...args])

    // After update: post-processing of the record
    await this.queryBuilder(request, 'update', 'after')

    // Re-fetch the record and return it
    // NOTE: request.params is all implementFetch uses
    return this.implementFetch(request)
  }

  implementDeleteSql (tables, joins, conditions) {
    const deleteString = 'DELETE'
    const tablesString = tables.join(',')
    const joinString = joins.join(' ')
    const whereString = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    return `${deleteString} ${tablesString} FROM \`${this.table}\` ${joinString} ${whereString} `
  }

  // Input: request.params (with key this.idProperty set)
  // Output: nothing
  async implementDelete (request) {
    this._checkVars()

    const id = request.params[this.idProperty]
    if (!id) throw new Error('request.params needs to contain idProperty for implementDelete')

    // Load the record, if it is not yet present in request as `record`
    let record
    if (request.record) {
      record = request.record
    } else {
      // Fetch the record
      record = await this.implementFetch(request) || null
    }

    // Check for permissions
    const { granted, message } = await this.checkPermissions(request, record)
    if (!granted) throw new this.constructor.ForbiddenError(message)

    // Get different select and different args if available
    const { tables, joins } = await this.queryBuilder(request, 'delete', 'tablesAndJoins')
    let { conditions, args } = await this.queryBuilder(request, 'delete', 'conditionsAndArgs')

    const { paramsConditions, paramsArgs } = this._paramsConditions(request)

    // Add mandatory conditions dictated by the passed params
    conditions = conditions.concat(paramsConditions)
    args = args.concat(paramsArgs)

    const query = await this.implementDeleteSql(tables, joins, conditions)

    // Perform the deletion
    await this.connection.queryP(query, args)

    // After insert: post-processing of the record
    await this.queryBuilder(request, 'delete', 'after')
  }

  // **************************************************
  // HELPER FUNCTIONS NEEDED BY implementQuery()
  // **************************************************

  async _optionsConditionsAndArgs (request) {
    const conditions = []
    const args = []

    const ch = request.options.conditionsHash

    for (const k in ch) {
      const kEsc = `\`${k}\``
      // Add fields that are in the searchSchema
      if (this.searchSchema.structure[k] && this.schema.structure[k] && String(ch[k]) !== '') {
        if (ch[k] === null) {
          conditions.push(`${this.table}.${kEsc} IS NULL`)
        } else {
          conditions.push(`${this.table}.${kEsc} = ?`)
          args.push(ch[k])
        }
      }
    }

    for (const k in request.params) {
      const kEsc = `\`${k}\``
      if (this.schema.structure[k] && String(request.params[k]) !== '') {
        conditions.push(`${this.table}.${kEsc} = ?`)
        args.push(request.params[k])
      }
    }
    return { conditions, args }
  }

  _optionsSort (request) {
    const optionsSort = request.options.sort
    const sort = []
    if (Object.keys(optionsSort).length) {
      for (const k in optionsSort) {
        sort.push(`${this.table}.${k} ${Number(optionsSort[k]) === 1 ? 'DESC' : 'ASC'}`)
      }
    }
    return sort
  }

  implementQuerySql (fields, joins, conditions, sort) {
    const selectString = 'SELECT'
    const fieldsString = fields.join(',')
    const joinString = joins.join(' ')
    const whereString = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : ''
    const sortString = sort.length
      ? `ORDER BY ${sort.join(',')}`
      : ''
    const rangeString = 'LIMIT ?, ?'

    return {
      fullQuery: `${selectString} ${fieldsString} FROM \`${this.table}\` ${joinString} ${whereString} ${sortString} ${rangeString}`,
      countQuery: `SELECT COUNT(*) AS grandTotal FROM \`${this.table}\` ${joinString} ${whereString} ${sortString}`
    }
  }

  // Input: request.params, request.options.[conditionsHash,ranges.[skip,limit],sort]
  // Output: { dataArray, total, grandTotal }
  async implementQuery (request) {
    this._checkVars()

    request.options = { ...request.options }

    // Sanitise request.options.sort and request.options.ranges,
    // which are set to options or store-wide defaults
    request.options.sort = request.options.sort || this.defaultSort || {}
    request.options.ranges = request.options.ranges || { skip: 0, limit: this.defaultLimitOnQueries }

    // Validate the search schema
    const { validatedObject, errors } = await this.searchSchema.validate(request.options.conditionsHash, { onlyObjectValues: true })
    if (errors.length) throw new this.constructor.BadRequestError({ errors: errors })
    request.options.conditionsHash = validatedObject

    // Check for permissions
    const { granted, message } = await this.checkPermissions(request, validatedObject)
    if (!granted) throw new this.constructor.ForbiddenError(message)

    // Get different select and different args if available
    const { fields, joins } = await this.queryBuilder(request, 'query', 'fieldsAndJoins')
    const { conditions, args } = await this.queryBuilder(request, 'query', 'conditionsAndArgs')
    const sort = await this.queryBuilder(request, 'sort', null)

    const { fullQuery, countQuery } = await this.implementQuerySql(fields, joins, conditions, sort)

    // Add skip and limit to args
    const argsWithLimits = [...args, request.options.ranges.skip, request.options.ranges.limit]

    let result = await this.connection.queryP(fullQuery, argsWithLimits)
    const grandTotal = (await this.connection.queryP(countQuery, args))[0].grandTotal

    // Transform the result it if necessary
    let transformed
    if (result.length) {
      transformed = await this.transformResult(request, 'query', result)
    }
    if (transformed) result = transformed

    return { data: result, grandTotal: grandTotal }
  }

  implementFetchSql (fields, joins, conditions) {
    const selectString = 'SELECT'
    const fieldsString = fields.join(',')
    const joinString = joins.join(' ')
    const whereString = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    return `${selectString} ${fieldsString} FROM \`${this.table}\` ${joinString} ${whereString} `
  }

  // Input: request.params (with key this.idProperty set)
  // Output: an object
  async implementFetch (request) {
    this._checkVars()

    const id = request.params[this.idProperty]
    if (!id) throw new Error('request.params needs to contain idProperty for implementFetch')

    // Get different select and different args if available
    const { fields, joins } = await this.queryBuilder(request, 'fetch', 'fieldsAndJoins')
    let { conditions, args } = await this.queryBuilder(request, 'fetch', 'conditionsAndArgs')

    const { paramsConditions, paramsArgs } = this._paramsConditions(request)

    // Add mandatory conditions dictated by the passed params
    conditions = conditions.concat(paramsConditions)
    args = args.concat(paramsArgs)

    const query = await this.implementFetchSql(fields, joins, conditions)

    // Get the result
    const records = await this.connection.queryP(query, args)

    // Get the record
    let record = records[0]

    // Check for permissions
    const { granted, message } = await this.checkPermissions(request, record)
    if (!granted) throw new this.constructor.ForbiddenError(message)

    // Transform the record if necessary
    let transformed
    if (record) transformed = await this.transformResult(request, 'fetch', record)
    if (transformed) record = transformed

    return record
  }
}

exports = module.exports = Mixin
