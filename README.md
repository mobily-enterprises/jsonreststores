JsonRestStores
==============

Rundown of features:

* **DRY approach**. Create complex applications keeping your code short and tight, without repeating yourself.
* **Database is optional**. When creating a store, all you have to do is write the essential queries to fetch/modify data.
* **Database ready**. Comes with mixins to use MySql (more to come)
* **Protocol-agnostic**. HTTP is only one of the possible protocols.
* **API-ready**. Every store function can be called via API

# To integrate in documentation

NOTE. When creating a store, you can take the following shortcuts:
  * Don't specify `paramIds`. If not specified, it will be worked out from publicURL
  * Don't specify `idProperty`. If idProperty not specified, it will be assumed last element of paramIds

# Introduction to (JSON) REST stores

Imagine that you have a web application with bookings, and users connected to each booking, and that you want to make this information available via a JSON Rest API. You would have to define the following routes in your application:

* `GET /bookings/`
* `GET /bookings/:bookingId`
* `PUT /bookings/:bookingId`
* `POST /bookings/`
* `DELETE /bookings:/bookingId`

And then to access users for that booking:

* `GET /bookings/:bookingId/users/`
* `GET /bookings/:bookingId/users/:userId`
* `PUT /bookings/:bookingId/users/:userId`
* `POST /bookings/:bookingId/users/`
* `DELETE /bookings/:bookingId/users/:userId`

It sounds simple enough (although it's only two tables and it already looks rather boring). It gets tricky when you consider that:

* When implementing `GET /bookings/`, you need to parse the URL in order to enable data filtering (for example, `GET /bookings?dateFrom=1976-01-10&name=Tony` will need to filter, on the database, all bookings made after the 10th of January 1976 by Tony).
* When implementing `GET /bookings/`, you need to return the right `Content-Range` HTTP headers in your results so that the clients know what range they are getting.
* When implementing `GET /bookings/`, you also need to make sure you take into account any `Range` header set by the client, which might only want to receive a subset of the data
* With `PUT`, you need to consider the HTTP headers `If-match` and `If-none-match` to see if you can//should//must overwrite existing records
* All unimplemented methods should return a `501 Unimplemented Method` server response

This is only a short list of obvious things: there are many more to consider. The point is, when you make a store you should be focusing on the important parts (the data you gather and manipulate, and permission checking) rather than repetitive, boilerplate code.

With JsonRestStores, you can create JSON REST stores without ever worrying about any one of those things. You can concentrate on what _really_ matters: your application's data, permissions and logic.

If you are new to REST and web stores, you will probably benefit by reading a couple of important articles. Understanding the concepts behind REST stores will make your life easier. I suggest you read [John Calcote's article about REST, PUT, POST, etc.](http://jcalcote.wordpress.com/2008/10/16/put-or-post-the-rest-of-the-story/). It's a fantastic read, and I realised that it was written by John, who is a long term colleague and fellow writer at Free Software Magazine, only after posting this link here!

# How to implement a store

JsonRestStores handles everything except:

* Permissions
* Schema validation
* Data manipulation

Data-oriented calls are the bridge between your stores and your actual data. Data can be stored in a database, text files, or even remotely.

Here is the list of calls that must be implemented -- and which methods need them:

 * `implementFetch(request)`. Required for methods `put`, `get`, `delete`.
 * `implementInsert(request)`. Required for methods `post` and `put` (new records)
 * `implementUpdate(request)`. Required for method `put` (existing records)
 * `implementDelete(request`. Required for method `delete`.
 * `implementQuery(request)`. Required for methods `getQuery`.

Looking it from a different perspective, here are the `implement***` methods you will need to implement for each method to work properly:

 * `get`: `implementFetch()`.
 * `getQuery`: `implementQuery()`
 * `put`: `implementFetch()`, `implementInsert()`, `implementUpdate()`
 * `post`: `implementInsert()`
 * `delete`: `implementFetch()`, `implementDelete()`

When developing these methods, it's important to make sure that they function exactly as expected.

## `implementFetch(request)`

This method is used to fetch a single record from the data source. The attributes taken into consideration in `request` are:

* `request.remote`.
* `request.params`. Sets the filter to search for the record to be fetched. For local request, it's acceptable to just match the key in `request.params` matching `self.idProperty`. For remote requests, it's best to filter data so that every key in `request.params` matches the equivalent key in the record. This means that fetching `/manager/3/document/44` ought to create a query where `managerId` is `3` and `documentId` is `44`

Returning a falsy value implies that the item wasn't found.

## `implementInsert(request)`

This method is used to add a single record to the data source. The attributes taken into consideration in `request` are:

* `request.remote`.
* `request.body`. The record that will effectively be written onto the database
* `request.options.placement`. If set, it can be `first` (place the record first), `last` (place the record last) or `after` (place the record after another one)
* `request.options.placementAfter`. If `request.options.placement` is `after`, the new record will be placed after the one with ID matching `placementAfter`.

The inserted record should be returned by this method.

## `implementUpdate(request)`

This method is used to update a single record in the data source. The attributes taken into consideration in `request` are:

* `request.remote`.
* `request.params`. Sets the filter to search for the record to be updated. See `implementFetch()`
* `request.body`. The fields to be updated in the data source. Even though it depends on design decisions, generally speaking each field in the schema should be updated
* `request.field`. If set, this is a _field update_. This means that the query is only meant to update one specific field.
* `request.options.placement`. If set, it can be `first` (place the record first), `last` (place the record last) or `after` (place the record after another one)
* `request.options.placementAfter`. If `request.options.placement` is `after`, the new record will be placed after the one with ID matching `placementAfter`.

The updated record should be returned by this method.

## `implementDelete(request)`

This method is used to delete a single record from the data source. The attributes taken into consideration in `request` are:

* `request.remote`.
* `request.params`. Sets the filter to search for the record to be deleted. See `implementFetch()`

The deleted record should be returned by this method.

## `implementQuery(request)`

This method is used to fetch a set of records from the data source. The attributes taken into consideration in `request` are:

* `request.remote`.
* `request.params`. For remote requests, adds filtering restrictions to the query so that only matching records will be fetched. For local request, such extra filtering should be avoided.
* `request.options`. The options object that will define what data is to be fetched. Specifically:
  * `request.options.conditions`: an object specifying key/value criteria to be applied for filtering.
  * `request.options.sort`: an object specifying how sorting should happen. For example `{ surname: -1, age: 1  }`.
  * `request.options.range`: an object with up to attributes:
    * `limit` must make sure that only a limited number of records are fetched;
    * `skip` must make sure that a number of records are skipped.

The list of returned records (as array) should be returned by this method.

# Creating a store

Creating a store is a matter of implementing the calls described above. You _can_ be lazy (or smart), and create stores based on MySql and using schema validation by using [jsonreststores-mysql](https://github.com/mercmobily/jsonreststores-mysql) which comes with all of those functions implemented automatically, as well as the ability to customise queries, data validation and permissions.

jsonreststores-mysql is the ideal solution for DB-oriented stores; however, there is often a strong case for non-DB stores (see: fetching data remotely on-the-fly, or providing endpoints which will perform complex maintenance operations, etc.)


# A simple (database-free) store



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
        var result = await connection.queryP(`SELECT * FROM managers LIMIT ?,?`, [ request.options.skip || 0, request.options.limit || 0 ])
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



# Naming conventions for stores

It's important to be consistent in naming conventions while creating stores. In this case, code is clearer than a thousand bullet points:

    var Managers = declare( Store, {

      schema: new Schema({
        // ...
      });

      publicURL: '/managers/:id',

      storeName: `managers`
      // ...
    }
    var managers = new Managers();

    var People = declare( Store, {

      schema: new Schema({
        // ...
      });

      publicURL: '/people/:id',

      storeName: `people`
      // ...
    }
    var people = new People();


* Store names as string (e.g. `storeName`) should be lowercase and are plural (they are collections representing multiple entries)
* Classes (derived from `Store`) are in capital letters
* URLs are in non-capital letters (following the stores' names, since everybody knows that `/Capital/Urls/Are/Silly`)

# NOTE: DOCUMENTATION UPDATED TO THIS POINT

## preMiddleware and postMiddleware




## The error objects

This is the comprehensive list of errors the class can create:

  * `BadRequestError` Like this: `new BadRequestError( { errors: errors } )`
  * `UnauthorizedError`
  * `ForbiddenError`
  * `NotFoundError`
  * `PreconditionFailedError`
  * `UnprocessableEntityError` Like this: `UnprocessableEntityError( { errors: errors } )`
  * `NotImplementedError`
  * `ServiceUnavailableError`. Like this: `ServiceUnavailableError( { originalErr: error } )`

These error constructors are borrowed from the [Allhttperrors](https://npmjs.org/package/allhttperrors) module -- you should its short and concise documentation. The short version is that `errorObject.status` and `errorObject.httpError` will be set as the error number, and the constructor can have either a string or an object as parameters.

The error objects are all pretty standard. However:

* `ServiceUnavailableError` errors will be created with an `originalErr` parameter containing the original error object. For example if the database server goes down, the module will return a `ServiceUnavailableError` error object which will include the original MongoDB error in its `originalErr` parameter.

* `UnprocessableEntityError` and `BadRequestError` are both created when field validation fails. They error objects will always have an `errors` attribute, which will represent an array of errors as they were returned by SimpleSchema. For example:


    [
      { field: 'nameOfFieldsWithProblems', message: 'Message to the user for this field' },
      { field: 'nameOfAnotherField', message: 'Message to the user for this other field' },
    ]

JsonRestStores only ever throws (generic) Javascript errors if the class constructor was called incorrectly, or if an element in `paramIds` is not found within the schema. So, it will only ever happen if you use the module incorrectly. Any other case is chained through.

## Error management

At some point in your program, one of your callbacks might have the dreaded `err` first parameter set to an error rather than null. This might happen  with your database driver (for example your MongoDB process dies), or within your own module (validation after a `PUT` fails).

JsonRestStores allows you to decide what to do when this happens.

### `chainErrors`

You can control what happens when an error occurs with the `chainErrors` attribute. There are three options:

#### `all`

If you have `chainErrors: all` in your class definition: JsonRestStores will simply call `next( error )` where `error` is the error object. This means that it will be up to another Express middleware to deal with the problem.

#### `none`

If you have `chainErrors: none` in your class definition: if there is a problem, JsonRestStores will _not_ call the `next()` callback at all: it will respond to the client directly, after formatting it with the object's `self.formatErrorResponse()` method (see below).

Do this if you basically want to make absolute sure that every single request will end right there, whether it went well or not. If you do this, you might want to define your own `self.formatErrorResponse()` method for your store classes, so that the output is what you want it to be.

#### `nonhttp`

If you have `chainErrors: nonhttp` in your class definition, JsonRestStores will only call `next( err ) ` for non-HTTP errors --  any other problem (like your database server going down) will be handled by the next Express error management middleware. Use this if you want the server to respond directly in case of an HTTP problem (again using `self.formatErrorResponse()` to send a response to the client), but then you want to manage other problems (for example a database problem) with Express.

### `self.formatErrorResponse()`

In those cases where you decide to send a response to the client directly (with `chainErrors` being `none` or `nonhttp`), the server will send a response to the client directly. The body of the response will depend on what you want to send back.

The stock `self.formatErrorResponse()` method will simply return a Json representation of the error message and, if present, the `errors` array within the error.

### `self.logError()`

Whenever an error happens, JsonRestStores will run `self.logError()`. This happens regardless of what `self.chainErrors` contains (that is, whether the error is chained up to Express or it's managed internally). Note that there is no `callback` parameter to this method: since it's only a logging method, if it fails, it fails.


## The response

The reponse is delivered by JsonRestStores using the function `protocolSendHTTP` for HTTP transport, and `protocolSendXXX` for XXX transport. At the moment, only HTTP is implemented via the `HTTPMixin` mixin. `protocolSendXXX` has the following signature:

    protocolSendXXX( request, method, data, status, cb )

### Response in case everything went well

In case there was no error, the parameters are as follows:

* `request`: the request object
* `method`: the method being handled; it can be `get`, `getQuery`, `put`, `post`, `delete`,
* `data`: the data being delivered.
* `status`: the status set by JsonRestStores. For non-errors, the status is set as:
  * `get`: 200.
  * `getQuery`: 200
  * `put`: 201 for newly created records, and 200 for overwriting of existing records
  * `post`: 201
  * `delete`: 204

### Response in case of error

In case there was an error, the store will only send data if `chainError` is set to `none` or `nonhttp` (and the error isn't an HTTP error). Otherwise, it will simply call the callback with the error as its first parameter, as per normal in node (it will be up to your application to manage the error, which is simply pussed up the callback chain).

If chaining is off, and a response is to be sent to the client, then `protocolSendXXX` will be used. In this case, the `data` argument of `protocolSendXXX` will be set as the error itself, with two properties added to it:
  * `formattedErrorResponse` (the formatted error response, formatted thanks to the store's `formatErrorResponse()` method)
  * `originalMethod` (the method that triggered the error).

Also, `status` will be set to the HTTP status code.

_`protocolSendXXX()` is always passed an HTTP error._ In case the error was caused by something else (for example, the connection to the database dropped), the error will be set as 503, and the error object will also have a `originalErr` attribute which represents the original error that triggered the 503 HTTP error.

# Receiving HTTP requests and sending HTTP responses: `HTTPMixin`

# Conclusion

TODO: Document HTTPMixin, explaining how each header is transformed into an option
