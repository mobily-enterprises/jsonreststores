JsonRestStores
==============

Rundown of features:

* **DRY approach**. Create complex applications keeping your code short and tight, without repeating yourself.
* **Database is optional**. When creating a store, all you have to do is write the essential queries to fetch/modify data.
* **Database ready**. Comes with mixins to use MySql (more to come)
* **Protocol-agnostic**. HTTP is only one of the possible protocols.
* **File uploads**. It automatically supports file uploads, where the field will be the file's path
* **API-ready**. Every store function can be called via API
* **Great documentation**. (Work in progress after the rewrite)

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

Creating a store is a matter of implementing the calls described above. You _can_ be lazy (or smart), and create stores based on MySql and using schema validation by using [jsonreststores-mysql](http://...) which comes with all of those functions implemented automatically, as well as the ability to customise queries, data validation and permissions.

jsonreststores-mysql is the ideal solution for DB-oriented stores; however, there is often a strong case for non-DB stores (see: fetching data remotely on-the-fly, or providing endpoints which will perform complex maintenance operations, etc.)


# A simple (database-free) store



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

# File uploads

File upload is something that happens at HTTP level. So, it's implemented in HTTPMixin.

    // Basic definition of the managers store
    class Managers extends HTTPMixin(Store) {
      static get schema () {
        return new Schema({
          name: { type: 'string', trim: 60 },
          surname: { type: 'string', searchable: true, trim: 60 }
          picture: { default: '', type: 'string', trim: 128 },
        })
      }

      static get storeName () { return 'managers' }
      static get publicURL () { return '/managers/:id' }

      static get handlePut () { return true }
      static get handlePost () { return true }
      static get handleGet () { return true }
      static get handleGetQuery () { return true }
      static get handleDelete () { return true }

      static get uploadFields () { return {
        picture: {
          destination: '/home/www/files',
        },  
      }}

      // ...implement??? functions
    }

In this store:

* The store has an `uploadFields` attribute, which lists the fields that will represent file paths resulting from the successful upload
* The field is populated with the full path to the uploaded file

For this to happen, effectively HTTPMixin will:

* add a middleware in stores with `uploadFields`, adding the ability to parse `multipart/formdata` input from the client
* save the files in the required location
* set `req.body.picture` as the file's path, and `req.bodyComputed.picture` to true.

JsonRestStores will simply see values in `req.body`, blissfully unaware of the work done to parse the requests' input and the work to automatically populate `req.body` with the form values as well as the file paths.

On the backend, JsonRestStores uses `multer`, a powerful multipart-parsing module. However, this is basically transparent to JsonRestStores and to developers, except some familiarity with the configuration functions.

## Configuring file uploads

The store above only covers a limited use case. Remembering that the `file` object has the following fields:

* `fieldname` - Field name specified in the form
* `originalname` - Name of the file on the user's computer
* `encoding` - Encoding type of the file
* `mimetype` - Mime type of the file
* `size` - Size of the file in bytes
* `destination` - The folder to which the file has been saved
* `filename` - The name of the file within the destination
* `path` - The full path to the uploaded file


In order to configure file uploads, you can set three `static get` attributes you can set when you declare you store:

* `uploadFilter` -- to filter incoming files based on their names or fieldName
* `uploadLimits` -- to set some upload limits, after which JsonRestStores will throw a `UnprocessableEntity` error.
* `uploadFields` -- it can have two properties: `destination` and `fileName`.

Here are these options in detail:

### `uploadFilter`

This allows you to filter files based on their names and `fieldName`s. You only have limited amount of information for each file:

    { fieldname: 'fileName',
      originalname: 'test.mp4',
      encoding: '7bit',
      mimetype: 'video/mp4' }

This is especially useful if you want to check for swearwords in the file name, or the file type. You can throw and error if the file type doesn't correspond to what you were expecting:

    uploadFilter: function( req, file, cb ){
      if( file.mimetype != 'video/mp4') return cb( null, false );
      cb( null, true );
    }

Note that because this code run in the context of `multer`, it uses callback-style,

### `uploadLimits`

This allows you to set specific download limits. The list comes straight from `busbuy`, on which JsonRestStores is based:

* `fieldNameSize` -- Max field name size (in bytes) (Default: 100 bytes).
* `fieldSize` -- Max field value size (in bytes) (Default: 1MB).
* `fields` -- Max number of non-file fields (Default: Infinity).
* `fileSize` -- For multipart forms, the max file size (in bytes) (Default: Infinity).
* `files` -- For multipart forms, the max number of file fields (Default: Infinity).
* `parts` -- For multipart forms, the max number of parts (fields + files) (Default: Infinity).
* `headerPairs` -- For multipart forms, the max number of header key=>value pairs to parse Default: 2000 (same as node's http).

For example, the most typical use case would be:

    static get uploadLimits () { return {
      fileSize: 50000000 // 50 Mb
    }}

### `uploadFields`

This is the heart of the upload abilities of JsonRestStores.

It accepts two parameters:

#### `destination`

This parameter is mandatory, and defines where the files connected to that field will be stored. It can either be a string, or a function with the following signature: `function( req, file, cb )`. It will need to call the callback `cb` with `cb( null, FULL_PATH )`. For example:

    static get uploadFields () { return {
      picture: {
        destination: function (req, file, cb) {
          // This can depend on req, or file's attribute
          cb( null, '/tmp/my-uploads');
        }
      }
    }

#### `fileName`

It's a function that will determine the file name. By default, it will be a function that works out the file name from the field. By default, if you don't define a `fileName` function, it will be the equivalent of writing:

If you don't set it, it will be:

    static get uploadFields () { return {
      picture: {
        destination: function (req, file, cb) {
          // This can depend on req, or file's attribute
          cb( null, '/tmp/my-uploads');
        },

        // If the ID is there (that's the case with a PUT), then use it. Otherwise,
        // simply generate a random string
        fileName: function( req, file, cb ){
          var id = req.params[ this.idProperty ];
          if( ! id ) id = crypto.randomBytes( 20 ).toString( 'hex' );

          // That's it
          return cb( null, file.fieldname + '_' + id ); // ._
        }
      }
    },

The default function works fine in most cases. However, you may want to change it.

#### `uploadErrorProcessor`

By default, when there is an error, the file upload module `multer` will throw and error. It's  much better to encapsulate those errors in HTTP errors. This is what uploadErrorProcessor does. By default, it's defined as follow (although you can definitely change it if needed):

    uploadErrorProcessor: function( err, next ){
      var ReturnedError = new this.UnprocessableEntityError( (err.field ? err.field : '' ) + ": " + err.message );
      ReturnedError.OriginalError = err;
      return next( ReturnedError );
    },


# NOTE: DOCUMENTATION UPDATED TO THIS POINT


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


# Store APIs

JsonRestStores allows you to run store methods from within your programs, rather than accessing them via URL. This is especially useful if you have a store and want to simulate an HTTP request within your own programs. Note that for database-backed methods you should use SimpleDbLaye methods (you can access the SimpleDbLayer table object in your store via `store.dbLayer`).

The API is really simple:

* `Store.apiGet( id, options, next( err, doc ) {})`
* `Store.apiGetQuery( options, next( err, queryDocs ){} )`
* `Store.apiPut(  body, options, next( err, doc ){} )`
* `Store.apiPost( body, options, next( err, doc ){} )`
* `Store.apiDelete( id, options, next( err, doc ){} )`

The `next()` call is the callback called at the end.

When using the API, the `options` object is especially important, as it defines how the API will work. When a request comes from a remote operation, the `options` object is populated depending on the requested URL and HTTP headers. When using the API, you need to popuate `options` manually in order to obtain what you desire. `options` is especially important while querying, as that's where you define what you filter and order the results by.

Since there is no HTTP connection to extrapolate options from, the `options` parameter in every API call is assigned directly to `request.options`. For all of the available options, refer to the [The options object](the-options-object) section in this guide.

All normal hooks are called when using these functions. However:

* Any check on `paramIds` is turned off: you are free to query a store without any pre-set automatic filtering imposed by `paramIds`. If your store has a `publicURL` of `/workspaces/:workspaceId/users/:id`, and you request `GET /workspaces/10/user/11`, in remote requests the `user` data source will be looked up based on _both_ `workspaceId` and `id`. In API (non-remote) requests, the lookup will only happen on `id`.
* `request.params` is automatically set to a hash object where the `idProperty` attribute matches the passed object's ID property. For example, for `{ id: 10, colour: 'red' }`, the `request.params` object is automatically set to  { `id: 10 }`. (This is true for all methods except `getQuery` and `post`, which don't accept objects with IDs). Note that you can pass `options.apiParams` to force `request.params` to whatever you like.
* All `store.handleXXX` properties are ignored: all methods will work
* The `request.remote` variable is set to false
* Permissions checking methods are not called at all: permission is always granted
* When the request is done, rather than ending data through using the transport of choice (for example HTTP), the `next()` callback is called with the results.

# Conclusion

TODO: Document HTTPMixin, explaining how each header is transformed into an option
