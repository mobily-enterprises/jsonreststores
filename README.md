JsonRestStores
==============

JsonRestStores is a one-stop module that allows you to create fully functional, configurable Json REST stores using NodeJS. A store can be inherited from another store, and can define all sorts of hooks to configure how it behaves and what it does (including permissions). It's also very easy to create "nested" stores (`http://www.example.com/bookings/1234/users` for example).

Database access is done using [simpledblayer](https://github.com/mercmobily/simpledblayer), which at the moment supports:

* MongoDb
* TingoDb

It's really simple to develop more layers (e.g. MariaDb, Postgresql, CouchDb, etc.);


# The problem it solves

Imagine that you have a web application with bookings, and users connected to each booking, and that you want to make this information available via a JSON Rest API. You would have to define the following route in your application:

* `GET /bookings`
* `GET /bookings/:bookingId`
* `PUT /bookings/:bookingId`
* `POST /bookings`
* `DELETE /bookings:/bookingId`

And then to access users for that booking:

* `GET /bookings/:bookingId/users`
* `GET /bookings/:bookingId/users/:userId`
* `PUT /bookings/:bookingId/users/:userId`
* `POST /bookings/:bookingId/users`
* `DELETE /bookings/:bookingId/users/:userId`

It sounds simple enough (although it's only two tables and it already looks rather boring). It gets tricky when you consider that:

* You need to make sure that permissions are always carefully checked. For example, only users within booking 1234 can `GET /bookings/:bookingId/users`
* You need to make sure you behave correctly in your `PUT` calls, as data might already be there
* When implementing `GET /bookings`, you need to make sure people can filter and order by the right fields by parsing the URL correctly. When you do that, you need to keep in mind that different parameters will need to trigger different filters on the database (for example, `GET /bookings?dateFrom=1976-01-10&name=Tony` will need to filter, on the database, all bookings made after the 10th of January 1976 by Tony).
* When implementing `GET /bookings`, you need to return the right `Content-Range` HTTP headers in your results
* When implementing `GET /bookings`, you also need to make sure you take into account any `Range` header set by the client, who might only want to receive a subset of the data
* With `POST` and `PUT`, you need to make sure that data is validated against some kind of schema, and return the appropriate errors if it's not.
* With `PUT`, you need to consider the HTTP headersd `If-match` and `If-none-match` to see if you can/should/must overwrite existing records
* You must remember to get your filters right: when implementing `GET /bookings/:bookingId/users/:userId`, you must make sure that you are making queries to the database without forgetting `:bookingId`. This sounds pretty obvious with only 2 stores...
* Don't forget about URL format validation: you need to make sure that anything submitted by the user is sanitised etc.

This is only a short list of obvious things. There are many more to consider.

With JsonRestStores, you can create JSON REST stores without ever worrying about any one of those things. You can concentrate on what _really_ matters: your application and your application's logic.


# Understand a little about REST stores

If you are new to REST and web stores, you will probably benefit by reading a couple of important articles. Understanding the concepts behind REST stores will make your life easier.

I suggest you read [John Calcote's article about REST, PUT, POST, etc.](http://jcalcote.wordpress.com/2008/10/16/put-or-post-the-rest-of-the-story/). (It's a fantastic read, and I realised that it was written by John, who is a long term colleague and friend, only much later!).

You should also read my small summary of [what a REST store actually provides](https://github.com/mercmobily/JsonRestStores/blob/master/jsonrest.md).

To understand stores and client interaction, you can read [Dojo's JsonRest stores documentation](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html), because the stores created using this module are 100% compliant with what Dojo's basic JsonRest module sends to servers.


## Modules used by JSON rest stores

* [SimpleDeclare - Github](https://github.com/mercmobily/SimpleDeclare). This module makes creation of constructor functions/classes a breeze. Using SimpleDeclare is a must when using JsonRestStores -- unless you want to drown in unreadable code

* [simpledblayer](https://github.com/mercmobily/simpledblayer). This module provides a constructor function what will act as the DB layer for JsonRestStores. Any DB supported by simpledblayer will work with JsonRestStores.

* [SimpleSchema - Github](https://github.com/mercmobily/SimpleSchema). This module makes it easy (and I mean, really easy) to define a schema and validate/cast data against it. It's really simple to extend a schema as well. It's a no-fuss module.

* [Allhttperrors](https://npmjs.org/package/allhttperrors). A simple module that creats `Error` objects for all of the possible HTTP statuses.

Note that all of these modules are fully unit-tested, and are written and maintained by me.



# Quick start

Here are three very common use-cases for JsonRest stores.

## A basic store (no DB)

Here is how you make a fully compliant store:

    // The basic Store class
    var Store = require('jsonreststores');
    var Schema = require('simpleschema');

    var Workspaces = declare( Store, {

      schema: new Schema({
        _id:           { type: 'id' },
        workspaceName: { type: 'string', notEmpty: true, trim: 20, searchable: true, sortable: true  },
      }),

      storeName: 'workspaces',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      paramIds: [ '_id' ],
    });

    // Create the right hooks to access the store
    Workspaces.onlineAll( app, '/workspaces/', ':_id' );

That's it: this is enough to make a full store which will handly properly all of the HTTP calls. Try it if you don't believe me!

* `Workspace` is a new class that inherits from `Store`. Creating the derived class is the first step towards creating a store
* `schema` is an object of type SimpleSchema. 
* `storeName` needs to be a unique name for your store. It is mandatory to have one, as (when used with a database) it will define the name of the DB table/collection
* `handleXXX` are attributes which will define how your store will behave. If you have `handlePut: false` and a client tries to PUT, they will receive an `NotImplemented` HTTP error
* `paramIds` is an array of IDs, ***where the last one is the most important one***: the last item in `paramIds` (in this case it's also the only one: `_id`) defines which field, within your schema, will be used as _the_ record ID when performing a PUT, a GET and an "incremental" POST (all operations that require a specific ID to function).
* `Workspaces.onlineAll()` creates the right Express routes to actually activate your stores. Specifically:

.

    // get (specific ID)
    app.get(    url + idName,  function( req, res, next ){ /* ... */ } );
    // getQuery (array of objects)
    app.get(    url,          function( req, res, next ){ /* ... */ } );
    // put (specific ID)
    app.put(    url + idName, function( req, res, next ){ /* ... */ } );
    // post (new record)
    app.post(   url,          function( req, res, next ){ /* ... */ } );
    // postAppend (append to existing record)
    app.post(   url + idName, function( req, res, next ){ /* ... */ } );
    // delete (specific ID)
    app.delete( url + idName, function( req, res, next ){ /* ... */ } );

So, the following routes will be defined:

    GET /workspaces/:id (returns a specific workspace)
    GET /workspaces (returns a collection of elements)
    PUT /workspaces/:id (writes over an existing workspace object)
    POST /workspaces/ (creates a new workspace object)
    POST /workspaces/:id  (appends to an existing workspace object)
    DELETE /workspaces/:id (deletes a workspace)

Note that this store is not actually hooked to any database server. So, it will actually send out dummy data.

## A basic store using MongoDB

Here is how you define a store that uses MongoDB as a backend.

    // The basic Store classes
    var Store = require('jsonreststores');
    var MongoDriverMixin = require('jsonreststores/MongoDriverMixin.js');

    // The basic Schema classes
    var Schema = require('simpleschema');
    var MongoSchemaMixin = require('simpleschema/MongoSchemaMixin.js');

    // The mongoWrapper class, that will make it easier to get a "db" object
    mongoWrapper = require('mongowrapper');

    // The new MongoStore and MongoSchema classes, which use multiple
    // inheritance to create MongoDB-specific classes
    var MongoStore = declare( [ Store, MongoDriverMixin ] );
    var MongoSchema = declare( [ Schema, MongoSchemaMixin ] );

    mw.connect('mongodb://localhost/EXAMPLE', {}, function( err, db ){

      // Check `err`, manage problems
      // NOTE that from now on, mw.db also represents the connection

      var Workspaces = declare( MongoStore, {

        schema: new MongoSchema({
          _id:           { type: 'id' },
          workspaceName: { type: 'string', notEmpty: true, trim: 20, searchable: true, sortable: true  },
          workgroup    : { type: 'string', notEmpty: true, trim: 20, searchable: true, sortable: true  },
        }),

        storeName: 'workspaces',

        db: db,

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        paramIds: [ '_id' ],
      });

      // Create the right hooks to access the store
      Workspaces.onlineAll( app, '/workspaces/', ':_id' );

    }); // End of mw.connect

As you can see, the only difference in the code is in the definition of the classes: a store created like this will actually create a collection called `workspaces` in your MongoDB server, and will allow clients to manipulate its contents via REST calls.

Note that there is code to connect to your MongoDB server using [mongoWrapper - Github](https://github.com/mercmobily/mongoWrapper), a simple library to create a MongoDB connection. You don't have to necessarily use mongoWrapper! Anything that returns a Mongo `db` object will be fine. However, note that using mongoWrapper does make some things easier. You would normally run `mw.connect()` in your `server.js` file, and then simply use `db = require('mongoWrapper).db` in your files.

**NOTE: From now on, in the documentation I will assume the definition of MongoSchema and MongoStores, and the presence of a `db` variable**

## A nested store

Stores are never "flat" as such: you have workspaces, and then you have users who "belong" to a workspace. Here is how you create a "nested" store:

    // The basic schema for the WorkspaceUsers table
    var WorkspaceUsers = declare( MongoStore, {

      schema: new MongoSchema({
        workspaceId: { type: 'id' },
        _id:         { type: 'id' },
        email     :  { type: 'string', trim: 128, searchable: true, sortable: true  },
        name      :  { type: 'string', trim: 60, searchable: true, sortable: true  },
      }),

      storeName:  'workspaceUsers',
      db: db,

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      paramIds: [ 'workspaceId', '_id' ],
    });

    WorkspaceUsers.onlineAll( app, '/workspaces/:workspaceId/users', ':_id' );

This is enough to create a store that will respond to `GET /workspace/2222/users/3333` (to fetch user 3333 from workspace 2222), `GET /workspace/2222/users` (to get all users of workspace 2222), and so on.

* Queries will _always_ honour the filter on `workspaceId`, both in queries and single-record operations.
* Fields listed in `paramIds` need to be also listed in the store's schema
* The second parameter of `onlineAll()` needs to include all `paramIds` except the last one
* The third parameter of `onlineAll()` needs to include the field that will be used as unique ID
* The third parameter actually needs to identify unique records in the table

### On naming conventions

It's important to be consistent in naming conventions while creating stores. In this case, code is cleared than a thousand bullet points:

#### Simple stores

    var Workspaces = declare( Store, { 
      // ...
      storeName: `workspaces`
      collectionName: `workspaces`
      // ...
    }
    Workspaces.onlineAll( app, '/workspaces/', ':_id' );

#### Nested stores        

    var WorkspaceUsers = declare( Store, { 
      // ...
      storeName: `workspaceUsers`
      collectionName: `workspaceUsers`
      // ...
    }
    WorkspaceUsers.onlineAll( app, '/workspaces/:workspaceId/users', ':_id' );

## A store derived/inherited from another store

Sometimes, you need to create a basic store that interfaces with a specific database table, and then create different ways to "view" that table.
For example, you might have a store that can access users and workspaces:

    // The basic schema for the WorkspaceUsers table
    var WorkspacesUsersBase = declare( Store, {

      schema: new Schema({
        userId:      { type: 'id' },
        workspaceId: { type: 'id' },
        _id:         { type: 'id' },
      }),

      db: db,

      storeName: 'workspacesUsersBase',
      collectionName: 'workspaceUsers',

      paramIds: [ '_id' ],
    });

The main difference is that we defined the collection name explicitly. So, the MongoDB driver will actually manipulate the collection `workspaceUsers`, whereas this store's name is `workspaceUsersBase`.

You cannot really do very much with this store: it doesn't handle any HTTP requests, and in fact it doesn't even have a route managed!
However, imagine that you want two stores: one that lists all workspaces belonging to a specific user, and another one that lists all users that are part of a workspace.

You can do that by creating two stores derived from this base one:

    var WorkspaceUsers = declare( WorkspacesUsersBase, {

      handlePut: false,
      handlePost: true,
      handleGet: false,
      handleGetQuery: true,
      handleDelete: true,

      storeName:  'workspaceUsers',
      paramIds: [ 'workspaceId', '_id' ],
    });
    WorkspaceUsers.onlineAll( app, '/workspaces/:workspaceId/users/', ':_id' );

    var UserWorkspaces = declare( WorkspacesUsersBase, {

      handlePut: false,
      handlePost: true,
      handleGet: false,
      handleGetQuery: true,
      handleDelete: true,

      storeName:  'userWorkspaces',
      paramIds: [ 'userId', '_id' ],
    });
    UserWorkspaces.onlineAll( app, '/users/:userId/workspaces/', '_id' );

That's it! You didn't have to re-define the schema again. Both stores inherit from `WorkspacesUsersBase`, but mark some differences:

* `handleXXX` entries are different.
* `storeName` is different . Each store needs to have a unique name.
* `paramIds` elements, as well as route strings, are different

The last difference is what makes the stores truly uniques: in `WorkspaceUsers`, when querying for example `GET /workspace/2222/users/`, JsonRestStores will filter the results so that only records where `workspaceId` is `2222` will be returned; in `UserWorkspaces`, when querying for example `GET /user/3333/workspaces`, only records where `userId` is `3333` will be returned.

The beauty of it is that you only had to define the schema once; the two different variations can be as similar, or as different, to the "base" store as you like.

Finally, note that the derived stores `WorkspaceUsers` and `UserWorkspaces` only allow `Post` (adding new entries), `GetQuery` and `Delete`.

# Important methods and attributes you can override

The basic `Store` class uses a rather long list of stock methods to complete requests. Some of them are there so that you can override them.

## Data manipulation

### `extrapolateDoc()`

In the documentation and the code, you will often see that two versions of the object are passed: `doc` and `fullDoc`. This is because JsonRestStores allows you to define a method, `extrapolateDoc()`, which will extrapolate the information you actually want to read. Basically, `extrapolateDoc()` is run every time a record is fetched from the database.

You can use this method if you want a store to only fetch a partial amount of information.

Note that permission functions have both `doc` and `fullDoc` so that they can easily make an "informed" decision on granting or denying access.

The method's signature is:

    extrapolateDoc( params, body, options, fullDoc, cb )`

### `prepareBeforeSend( doc, cb )`(

The method `prepareBeforeSend()` does exactly what it says: it will manipulate `doc` just before it's sent over to the client who requested it. This is especialy useful if you want to apply last minute changes to the data you send. _The changes only apply to data that is sent over the network!_ If you use a store via its API, this function will not be run.

The method's signature is:

    prepareBeforeSend( doc, cb )

## Queries

### `hardLimitOnQueries`

This is the limit of the number of elements that can be returned by a query. The default is 50.

## Permissions

By default, everything is allowed: stores allow pretty much anything and anything; anybody can DELETE, PUT, POST, etc. Furtunately, JsonRestStores allows you to decide exactly what is allowed and what isn't, by overriding specific methods.

Each permission function needs to call the callback: if everything went fine, `cb()` will be called with `cb( null, true )`; to fail, `cb( null, false )`.

Here are the functions:

 * `checkPermissionsPost( params, body, options, cb )` 
 * `checkPermissionsPostAppend( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsPutNew( params, body, options, cb )`
 * `checkPermissionsPutExisting( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsGet( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsGet( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsGetQuery( params, body, options, cb )`
 * `checkPermissionsDelete( params, body, options, doc, fullDoc, cb )`

Here is an example of a store only allowing deletion only to specific admin users:

    // The basic schema for the WorkspaceUsers table
    var WorkspaceUsers = declare( MongoStore, {

      schema: new MongoSchema({
        workspaceId: { type: 'id' },
        _id:         { type: 'id' },
        email     :  { type: 'string', trim: 128, searchable: true, sortable: true  },
        name      :  { type: 'string', trim: 60, searchable: true, sortable: true  },
      }),

      storeName:  'workspaceUsers',
      db: db,

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      paramIds: [ 'workspaceId', '_id' ],

      
      checkPermissionsDelete: function( params, body, options, doc, fullDoc, cb ){

        // User is logged in: all good
        if( req.session.user != 0 ){
          cb( null, true );

        // User is not logged in: fail!
        } else {
          cb( null, false );
        }

      },

    });

    WorkspaceUsers.onlineAll( app, '/workspaces/:workspaceId/users', ':_id' );

Permission checking can be as simple, or as complex, as you need it to be.

Note that if your store is derived from another one, and you want to preserve your master store's permission model, you can run `this.inheritedAsync(arguments)` like so:

      checkPermissionsDelete: function( params, body, options, doc, fullDoc, cb ){

        this.inheritedAsync( arguments, function( err, granted ) {

          // In case of error of permission problems, that's it
          if( err ) return cb( err, false );
          if( ! granted) return cb( null, false );

          // User is logged in: all good
          if( req.session.user != 0 ){
            cb( null, true );

          // User is not logged in: fail!
          } else {
            cb( null, false );
          }
       }
     },
 
This will ensure that the inherited `checkPermissionsDelete()` method is called, and 

## "After" hooks

These functions are handy where, in your own applications, you want "something" to happen after one of those operations is complete.

You can redefine them as you wish.

 * `afterPutNew( params, body, options, doc, fullDoc, overwrite, cb )` (Called after a new record is PUT)
 * `afterPutExisting( params, body, options, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb )` (After a record is overwritten with PUT)
 * `afterPost( params, body, options, doc, fullDoc, cb )` (After a new record is POSTed)
 * `afterPostAppend( params, body, options, doc, fullDoc, docAfter, fullDocAfter, cb )` (After an existing record is POST-appended to)
 * `afterDelete( params, body, options, doc, fullDoc, cb )` (After a record is deleted)
 * `afterGet( params, body, options, doc, fullDoc, cb  )` (After a record is retrieved)

Note that these hooks are run **after** data has been written to the database, but **before** a response is provided to the user.

# Searching in queries

The only method that allows searches, and that returns an array of objects, is `GetQuery`. `GetQuery` is called whenever the route is called without specifying the object ID in the URL. So, if `GET /users/1` will return the JSON representation of the user with `_id` `1`, `GET /users` will return an array of all users that satisfy the filter specified in the `GET` request (in this case, there is no filter).

## Filter types

In GetQuery, When querying a store you are able to specify a list of field/value pairs via URL. You are not able to decide on complex queries like `(a == b AND ( c == d OR e == f )`. However, you are able to decide the filter type, which can be `and` (all fields must match) or `or` (any one field matching will be satisfactory).

A typical URL would be:

    GET /workspaces?workspaceName=something&workgroup=owners

If your store specifies `queryFilterType` as `and`, all conditions must be met.

For example this store will have `and` set:

      var Workspaces = declare( MongoStore, {

        schema: new MongoSchema({
          _id:           { type: 'id' },
          workspaceName: { type: 'string', notEmpty: true, trim: 20, searchable: true, sortable: true  },
          workgroup    : { type: 'string', notEmpty: true, trim: 20, searchable: true, sortable: true  },
        }),

        storeName: 'workspaces',

        db: db,

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        paramIds: [ '_id' ],

        queryFilterType: 'and',

      });

      // Create the right hooks to access the store
      Workspaces.onlineAll( app, '/workspaces/', ':_id' );


## Schema attribute `searchPartial`

Some fields will need to be searched incrementally by the users. This means that if the user asks for `GET /users?workspaceName=some`, the query will have to return workspaces with names matching `some`, `something`, `somewhat`, and anything starting with `same`.

This is achieved by the attribute `searchPartial` in your schema.

So, to achieve this you would have a schema like this:

    // ...
    schema: new MongoSchema({
      _id:           { type: 'id' },
      workspaceName: { type: 'string', searchPartial: true, notEmpty: true, trim: 20, searchable: true, sortable: true  },
      workgroup    : { type: 'string', notEmpty: true, trim: 20, searchable: true, sortable: true  },
    }),
    // ...


## Schema attribute `searchable`

If you want a field to be searchable, you need to define the `searchable` attribute for it in your schema.

If you have:

    // ...
    schema: new MongoSchema({
      _id:           { type: 'id' },
      workspaceName: { type: 'string', searchPartial: true, notEmpty: true, trim: 20, searchable: true, sortable: true  },
      workgroup    : { type: 'string', notEmpty: true, trim: 20, searchable: true, sortable: true  },
    }),
    // ...


As you can see, `workspaceName` has `searchable`, whereas `workgroup` doesn't. This means that if you have an URL like this:

    GET /users?workspaceName=something&workgroup=owners

The parameter `workgroup` will be completely ignored: the filter will only apply to `workspaceName`.

## Schema attribute `sortable`

If a field is marked as `searchable`, then it may or may not be sortable too. This is what a URL will look like:

    /workspaces/?workspaceName=something&sortBy=+workspaceName,-workGroup

The field `sorBy` is interpreted by the GetQuery function: it's a list of comma-separated fields, each one starting with a `+` or with a `-`. If those fields are marked as `sortable` in the schema, then they will be sorted accordingly.

***NOTE TO DOJO USERS***: while using these stores with Dojo, you will _need_ to define them like so: `var store = new JsonRest( { target: "/workspaces/", sortParam: "sortBy" });`. The `sortParam` element is mandatory, as it needs to be `sortBy`. At this stage, JsonRestStores is _not_ able to interpret correctly URLs such as `/workspaces/?workspaceName=something&sort(+workspaceName,-workgroup)` (which is what Dojo will request if you do not specify `sortParam`).

## Search schema

Sometimes, you might decide to use a different schema for searches. For example, you might decide to only allow a search when a field is at least 4 characters long.

In this case, you can define a "search schema": a schema that will be applied to the fields before searching.

Here is an example:

    // ...
    schema: new MongoSchema({
      _id:           { type: 'id' },
      workspaceName: { type: 'string', notEmpty: true, trim: 20 },
      workgroup    : { type: 'string', notEmpty: true, trim: 20 },
    }),

    searchSchema: new MongoSchema({
      _id:           { type: 'id' },
      workspaceName: { type: 'string', searchPartial: true, min: 4, searchable: true, sortable: true  },
      workgroup    : { type: 'string', min: 2, searchable: true, sortable: true  },
    }),
    // ...


Another bonus point of using search schemas is that you can keep the search-specific parameters (`searchable`, `sortable` and `searchPartial`) out of the "main" schema.

# Errors returned and error management

JsonRestStores has very careful error management.

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

These error constructors are borrowed from the [Allhttperrors](https://npmjs.org/package/allhttperrors) module -- you should its short and concise documentation. The short version is that `errorObject.httpError` will be set, and the constructor can have either a string or an object as parameters.

The error objects are all pretty standard. However:

* `ServiceUnavailableError` errors will be created with an `originalErr` parameter containing the original error object. For example if the database server goes down, the module will return a `ServiceUnavailableError` error object which will include the original MongoDB error in its `originalErr` parameter.

* `UnprocessableEntityError` and `BadRequestError` are both created when field validation fails. They error objects will always have an `errors` attribute, which will represent an array of errors as they were returned by SimpleSchema. For example:

.

    [
      { field: 'nameOfFieldsWithProblems', message: 'Message to the user for this field', mustChange: true },
      { field: 'nameOfAnotherField', message: 'Message to the user for this other field', mustChange: false },
    ]


JsonRestStores only ever throws (generic) Javascript errors if the class constructor was called incorrectly, or if an element in `paramIds` is not found within the schema. So, it will only ever happen if you use the module incorrectly. Any other case is chained through.


## Error management

At some point in your program, one of your callbacks might have the dreaded `err` first parameter set to an error rather than null. This might happen  with your database driver (for example your MongoDB process dies), or within your own module (validation after a `PUT` fails).


### `chainErrors`

You can control what happens when an error occurs with the `chainErrors` attribute. There are three options:

#### `all`

If you have `chainErrors: all` in your class definition: JsonRestStores will simply call `next( error )` where `error` is the error object. This means that it will be up to another Express middleware to deal with the problem.

#### `none`

If you have `chainErrors: none` in your class definition: if there is a problem, JsonRestStores will _not_ call the `next()` callback at all: it will respond to the client directly, after formatting it with the object's `self.formatErrorResponse()` method.

Do this if you basically want to make absolute sure that every single request will end right there, whether it went well or not. If you do this, you will need to define your own `self.formatErrorResponse()` method for your store classes, so that output is what you want.

#### `nonhttp`

If you have `chainErrors: nonhttp` in your class definition: JsonRestStores will only call `next( err ) ` if one of the errors above happen -- any other problem (like your MongoDB server going down) will be handled by the next Express error management middleware. Use this if you want the server to respond directly in case of an HTTP problem (again using `self.formatErrorResponse()` to send a response to the client), but then you want to manage other problems (for example a MongoDB problem) with Express.

### `self.formatErrorResponse()`

In those cases where you decide to send a response to the client directly (with `chainErrors` being `none` or `nonhttp`), the server will send a response to the client directly. The body of the response will depend on what you want to send back.

The stock `self.formatErrorResponse()` method will simply return a Json representation of the error message and, if present, the `errors` array within the error.


### `self.logError()`

Whenever an error happens, JsonRestStore will run `self.logError()`. This happens regardless of what `self.chainErrors` contains (that is, whether the error is chained up to Express or it's managed internally). Note that there is no `callback` parameter to this method: since it's only a logging method, if it fails, it fails.


# Store APIs

JsonRestStores allows you to run methods from within your programs, rather than accessing them via URL. This is very helpful if you need to query a store within your own programs.
This is achieved with the following class functions:

* `Store.Get( id, options, next( err, doc, idProperty ) {})`
* `Store.GetQuery( options, next( err, queryDocs, idProperty){} )`
* `Store.Put( id, body, options, next( err, doc, idProperty){} )`. __Note: `id` can be set as null if body contains it__
* `Store.Post( body, options, next( err, doc, idProperty ){} )`
* `Store.PostAppend( id, body, options, next( err, docAfter, idProperty){}  )`
* `Store.Delete( id, options, next( err, doc, idProperty ){} )`

Note: the `next()` call is the callback called at the end. Note that `idProperty` is also passed, although it will likely be redundant as you are supposed to know in advance the fields in the table you are querying.

All normal hooks are called when using these functions. However:

* The `paramIds` array is shortened so that it only has its last element. This means that you are free to query a store without any pre-set automatic filtering imposed by `paramIds`
* All `request.handleXXX` are set to `true`
* You can search and sort by any fields (`searchable` and `sortable` are no longer necessary)
* The `request.remote` variable is set to false

The last item is especially important: when developing your own permission model, you will probably want to make sure you have different permissions for local requests and remote ones (or, more often, have no restrictions for local ones since you are the one initiating them).

When using the API, the `options` object is especially important, as it defines how the API will work.

When a request comes from a remote operation, the `options` object is populated depending on the parameters passed (`overwrite`, `sortBy`, `ranges`, `filters`) or the class' defaults (`searchPartial`, `queryFilterType`). When using the API, you need to popuate `options` manually in order to obtain what you desire. `options` is especially important while querying, as that's where you define what you filter and order the results by.

(If you are curious, when a remote connection is established the function `_initOptionsFromReq()` is the one responsible of getting headers and URL, and populating `options` before running the appropriate function).

* `overwrite` for `Put` requests; (if used as remote store, taken from URL)
* `sortBy` for `GetQuery` requests (if used as remote store, taken from URL)
* `ranges` for `GetQuery` requests; (if used as remote store, taken from URL)
* `filters` for `GetQuery` requests; (if used as remote store, taken from URL)
* `searchPartial` for `GetQuery` requests; (if used as remote store, taken from Schema definition)
* `queryFilterType` for `GetQuery` requests; (if used as remote store, taken from Class)

When querying from the API, can pass `overwrite`, `sortBy`, `ranges`, `filters` (as there is no HTTP request to take this information from) and _can_, if you want, override `searchPartial` (by default, set by the schema definition) and `queryFilterType` (by default, set in the Class definition).

Here is a detailed explanation of these options:

## overwrite

This option is only valid in a PUT context:

* if `options.overwrite` is not set, the `Put` request will happily overwrite an existing record, or create a new one.
* if `options.overwrite` is set:
 * If it's set to `false`, then the module will only allow the creation of new records on the database
 * If it's set to `true`, then the module will only allow overwriting existing records on the database

Example:

    // Will never overwrite an existing workspace
    Workspaces.Put( someId, { workspaceName: "Some workspace name" }, { overwrite: false }, function( res, err ){

For non-API calls, this option is set by the headers 'if-match' and 'if-none-match'.

# filters

This option applies to GetQuery calls: it's a simple object, where the keys are the field names, and their respective values are the filters. For example:

    { workspaceName: "Booker" }

A typical example could be:

    Workspaces.GetQuery( { filters: { workspaceName: 'Booker'} }, function( err, doc ) {
    })

For non-API calls, this option is set by the query string in the URL.

## searchPartial

This option is an associative array where each key is the field that must allow partial results. This means that filtering by `Boo` should return `Book`, `Booker`, and anything starting with `Boo`. For example:

    // Will return records with workspaceName starting with "Boo" and workGroup equals to "Full match"
    Workspaces.GetQuery( { 
      filters: { workspaceName: 'Boo', workGroup: 'Full match' },
      searchPartial: { workspaceName: true } 
    } , function( err, doc ) {
      // ...
    });

If `searchPartial` is not specified, then the `searchPartial` attribute of each record in the schema will be used instead.

For non-API calls, this option is set by the schema's value.

## queryFilterType

The option `queryFilterType` can be either `and` (all elements in filters need to match) or `or` (one of them matching is enough). 

If it's not specified, then the class' own `queryFilterType` attribute is used.

For non-API calls, this option is set by the schema's value.

## sortBy

This option is an object where each key is the key you want to sort by, and that key's value is either `1` (ascending order) or `-1` (descending order).

For example:

    // Will return records with workspaceName starting with "Boo" and workGroup equals to "Full match"
    Workspaces.GetQuery( {
      filters: { workspaceName: 'Boo' },
      sortBy: { workspaceName: 1, score: -1 },
    } , function( err, doc ) {
      // ...
    });

For non-API calls, this option is set by the query string in the URL. E.g. `/workspaces/?workspaceName=something&sortBy=+workspaceName,-workGroup`.

## ranges

Ranges are important as they allow you to define a limit on the number of records returned.

It represents an objects with the keys `rangeFrom`, `rangeTo`, `limit`. E.g.:

    // Will return records with workspaceName starting with "Boo" 
    Workspaces.GetQuery( { 
      filters: { workspaceName: 'Boo' }, searchPartial: { workspaceName: true } 
      ranges: { rangeFrom: 0, rangeTo: 24 }
    } , function( err, doc ) {
      // ...
    });

For non-API calls, ranges are set by the 'range' headers. For example `Range: items=0-24`. Note that the server will also return, after a range query, a header that will detail the range returned. For example `Content-Range: items 0-24/66`

# Database layers

## MongoMixin

The `MongoMixin` mixin class is the one responsible of making the Store actually write information onto a MongoDB collection. The following extra attributes are specified:

 * `collectionName` It's the MongoDB collection name. If it's not specified, `collectionName` will be the same as `storeName`
 * `db` It's the Mongo DB object, resulting from `connect()`
 * `handleXXX` properties are set by `false` by default (unlike the basic `Store` class, where they are set to `true` by default)

Normally, in MongoDB each record has an ID called `_id`. This is a very important field in MongoDB: even if you don't define one in your collection, mongoDB will automatically add one.

The last element in `paramIds` will tend to be `_id` if you use MongoDB as your database server. However, this is not a prerequisite: if the last paramIds is different to `_id`, things will still work fine. However, you will have an unused `_db` field in your collection.

## ...More to come

For now, there is only MongoDB integration available. However, the next section of the documentation explains exactly how to write a DB driver.

# TODO

The following items are much needed for this module:

* Ability to do forEach on queries for API. This means that, using the API, you can actually iterate amongst a big set of data without having to create an array. This would also bypass `hardLimitOnQueries`
* Good automatic tests (it would be about time).

# Developing a driver layer

The Store class itself is database-agnostic: it uses a set of functions to perform operations that require access to the database.
Such functions all start with the name `driver` and are:

* `driverAllDbFetch( params, body, options, cb )` (fetch a document)
* `driverGetDbQuery( params, body, options, cb )` (executes the query)
* `driverPutDbInsert( params, body, options, cb )`(inserts a record in the DB after a PUT)
* `driverPutDbUpdate( params, body, options, doc, fullDoc, cb )`(updates a record in the DB after a PUT)
* `driverPostDbInsertNoId( params, body, options, generatedId, cb  )`(adds a new record to the DB; a new ID will be created)
* `driverPostDbAppend( params, body, options, doc, fullDoc, cb )` (appends information to existing record via POST)
* `driverDeleteDbDelete( params, body, options, id, cb )`(deletes a record)

Writing a database layer is a matter of implementing these functions. Doing so is easy: you should use the MongoDriverMixin file as a template on how to implement those functions for other database layers.

Notes:

* You can see that all functions always have `params, body, options` as first parameters, even though `body` is in some cases always empty (for example in GET and DELETE operations). This is only to keep the codebase sane and consistent.

* The functions `driverPutDbUpdate()` and `driverPostDbAppend()` both work on existing records; they have as parameters `doc` and `fullDoc`, which represent the record _before_ the change; `doc` is basically `fullDoc` after `extrapolateDoc()` is run. 

# Behind the scenes

Understanding what happens behind the scenes is important to understand how the library works.
This is the list of functions that actually do the work behind the scenes:

 * `_makeGet()` (implements GET for one single document)
 * `_makeGetQuery()` (implements GET for a collection, no ID passed)
 * `_makePut()` (implements PUT for a collection)
 * `_makePost()` (implements POST for a collection)
 * `_makePostAppend()` (implements POST for a collection, when ID is present)
 * `_makeDelete()` (implements DELETE for a collection)

When you write:

    Workspaces.onlineAll( app, '/workspaces/', ':_id' );

You are actually running:

    // Make entries in "app", so that the application
    // will give the right responses
    app.get(      url + idName, Store.online.Get( Class ) );
    app.get(      url,          Store.online.GetQuery( Class ) );
    app.put(      url + idName, Store.online.Put( Class ) );
    app.post(     url,          Store.online.Post( Class ) );
    app.post(     url + idName, Store.online.PostAppend( Class ) );
    app.delete(   url + idName, Store.online.Delete( Class ) );

Note that "Class" is the constructor class (in this case `Workspaces`).
Let's take for example the first line: it creates a route for `/workspaces/:id` and adds, as a route handler, `Store.online.Put( Workspaces )`. 

This is what happens in that route handler:

    return function( req, res, next ){

      var request = new Class();

      // It's definitely remote
      request.remote = true;

      // Sets the request's _req and _res variables
      request._req = req;
      request._res = res;

      // Set the params and body options, copying them from `req`
      var params = {}; for( var k in req.params) params[ k ] = req.params[ k ];
      var body = {}; for( var k in req.body) body[ k ] = req.body[ k ];

      // Since it's an online request, options are set by "req"
      // This will set things like ranges, sort options, etc.
      var options = request._initOptionsFromReq( mn, req );

      // Actually run the request
      request._makePut( params, body, options, next );

    }

Basically, an object of type `Workspaces` is created. The `request` variable is an object able to perform exactly one operation -- which is exactly what will happen.

After that, the object variables `remote`, `_req` and `_res` are set. `remote` will be used by the object methods to determine how to return their results. `_req` and `_res` are set as they will be important for `remote` requests.

At that point, `req.params` and `req.body` are cloned into two variables with the same names.

Then, something interesting happens: the function `_initOptionsFromReq()` is run. `_initOptionsFromReq()` basically analyses the request and returns the right `options` depending on browser headers. For example, the `overwrite` attribute will depend on the browser headers `if-match` and `if-none-match` (for `Put`) whereas `sortBy `, `ranges` and `filters` will be set depending on the requested URL (for `GetQuery`).

Finally, `request._makePut()` is run, passing it `params`, `body`, `options` and `next`. `request._makePut()` is where the real magic actually happens: it will run the correct hooks, eventually performing the requested `PUT`.

## Analysis of a inner function: `_makePut()`

JsonRestStores does all of the boring stuff for you -- the kind things that you would write over and over and over again while developing a server store.

This is what happens in `_makePut()`. Once you understand this, it's actually quite trivial to see the code of the module to figure out what the others do too:

* **Checks that `self.handlePut` is true** If not, the method is not actually allowed.

* **Runs `self._checkParamIds( params, body, errors )`**. This will cast `params` so that each field listed in the `paramIds` array is cast and checked fully. Since elements in `paramIds` are the ones in the URL, it's important that this check is done beforehand.

* **Runs `self.driverAllDbFetch()**. The record is fetched. It's important that the _whole_ record is fetched by this function.

* **Checks the `options.overwrite` parameter**. The PUT will fail if the record already exists and `options.overwrite` is false.

* **Checks if record exists or not**. The calls made will differ depending whether the record is already there or not. Note that in the actual module's code, the code at this point actually splits.

* **Runs `self.checkPermissionsPutNew()/self.checkPermissionsPutExisting()`** This is obviously the function that will check permissions

* **Cleans up the schema**. All fields with parameter `doNotSave` in the schema are deleted from the object about to be saved

* **Runs `self.driverPutDbInsert()/self.driverPutDbUpdate()`**. The field is actually written to the database.

* **Runs `self.extrapolateDoc()`**. This is important as in some cases you only want a sub-section of the fetched record (for example, only a bunch of fields or the result of `JSON.parse()` of a specific field, etc. Basically, this turns whatever was fetched from the DB into whatever you want returned.

* **Runs `self.afterPutNew()/self.afterPutExisting()`**. This is a hook called "after" everything is done in terms of sending. However, it's called *before* sending the response to the client. So, it can still make things fail if needed.

* **Runs `self.prepareBeforeSend()`**. This is a "preparation" function: a function that can manipulate the item just before sending it

* **SEND item to client** This will only happen if `self.echoAfterPutNew()` is `true`, and it's actually a remote call.


## Analysis of a inner function: `_makeGet()`

This is what happens in `_makeGet()`. Once you understand this, it's actually quite trivial to see the code of the module to figure out what the others do too:

* **Checks that `self.handleGet` is true** If not, the method is not actually allowed.

* **Runs `self._checkParamIds( params, body, errors )`**. This will cast `params` so that each field listed in the `paramIds` array is cast and checked fully. Since elements in `paramIds` are the ones in the URL, it's important that this check is done beforehand.

* **Runs `self.driverAllDbFetch()**. The record is fetched. It's important that the _whole_ record is fetched by this function.

* **Runs `self.extrapolateDoc()`**. This is important as in some cases you only want a sub-section of the fetched record (for example, only a bunch of fields or the result of `JSON.parse()` of a specific field, etc. Basically, this turns whatever was fetched from the DB into whatever you want returned.

* **Runs `self.checkPermissionsGet()`** This is obviously the function that will check permissions

* **Runs `self.afterGet()`**. This is a hook called "after" everything is done in terms of sending. However, it's called *before* sending the response to the client. So, it can still make things fail if needed.

* **Runs `self.prepareBeforeSend()`**. This is a "preparation" function: a function that can manipulate the item just before sending it

* **SEND item to client**



# History and concepts behind it

I was developing a one-page Ajax application completely based on stores: there is a rich client, and a bunch of stores server-side which comply with the cloudy (excuse my pun) JsonRest specifications. I soon realised that creating a store is often a rather complicated process: there are several HTTP methods to _possibly_ implement, and a lot of things to take care of (like permissions, etc.).

I soon realised that the server side of the story was going to become a bunch of unmaintainable, repeated code. I couldn't have it. So, JsonRestStores was born.

Point list:

* Follows the KISS principle: everything is kept as simple as possible.

* 100% compliant with [Dojo's JsonRest stores](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html). This means for example that if you specify the option `{ overwrite: true }` for your store, the server will handle the if-match and if-none-match headers and will call the right method accordingly. Same applies with 

* 100% compliant with Dojo's query format. Dojo's `query()` call sends specific fields to the client. This module has everything you need so that you can concentrate on your data, rather than interpreting HTTP headers

* It's well structured: there is a base class, that provides all of the important methods; it works out of the box, returning dummy data. The base class is obviously not very useful: Database-specific sub-classes are what developers will use. At the moment, the following databases are supported:
  * Mongodb
  * ... more to come

* It uses simpleschema for simple, extendible error checking. 

* It uses OOP patterns neatly using simpledeclare: each store is a javascript constructor which inherits from the database-specific constructor (which inherits itself from a generic, base constructor).

* DB-specific stores are build with the principle of "sane defaults": without giving them any special parameters, they will "just work" mapping a database collection to a store/schema.

* The schema is very simple, and there is always one schema per store (although you can obviously re-use a schema variable). Schemas are responsible of 1) Casting input fields to their right type. This means that a field marked as "number" will be cast to a JS number 2) Trimming and input validation. Each type offers a bunch of helper functions. You can also define a schema-wide validate() function.





