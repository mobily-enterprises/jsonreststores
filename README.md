JsonRestStores
==============

JsonRestStores is a one-stop module that allows you to create fully functional, configurable Json REST stores using NodeJS. A store can be inherited from another store, and can define all sorts of hooks to configure how it behaves (including permissions). It's also very easy to create "nested" stores.

Database access is abstracted. At the moment, it supports the following database servers:

* MongoDb
* ... (more to come)


# Requirements

## Understand a little about REST stores

If you are new to REST and web stores, you should read a couple of things about REST stores. Understanding the concepts behind REST stores will make your life easier.

I suggest you read [John Calcote's article about REST, PUT, POST, etc.](http://jcalcote.wordpress.com/2008/10/16/put-or-post-the-rest-of-the-story/). (It's a fantastic read, and I realised that it was written by John, who is a long term colleague and friend, only much later!).

You should also read my small summary of [what a REST store actually provides](jsonrest.md).

To understand stores and client interaction, you can read [Dojo's JsonRest stores documentation](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html), because the stores created using this module are 100% compliant with what Dojo's basic JsonRest module sends to servers.

## Modules used by JSON rest stores

Each REST store is defined as a "constructor functions" (referred as a "class" from now on). You can derive a REST store from another one if needed. You also need to "mixin" the right DB driver with the main class in order to use it with a DB layer (such as MongoDB). So, if you use this module, you also need to use [SimpleDeclare - Github](https://github.com/mercmobily/SimpleDeclare). Examples are provided.

Each store has a schema defined. A schema is an object created with the [SimpleSchema - Github](https://github.com/mercmobily/SimpleSchema) constructor. You should make yourself familiar with SimpleSchema if you intend to use this module. Luckily, SimpleSchema is really simple to learn and use.

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
    app.get(      url + idName,  function( req, res, next ){ /* ... */ } );
    // getQuery (array of objects)
    app.get(      url,          function( req, res, next ){ /* ... */ } );
    // put (specific ID)
    app.put(      url + idName, function( req, res, next ){ /* ... */ } );
    // post (new record)
    app.post(     url,          function( req, res, next ){ /* ... */ } );
    // postAppend (append to existing record)
    app.post(     url + idName, function( req, res, next ){ /* ... */ } );
    // delete (specific ID)
    app.delete(   url + idName, function( req, res, next ){ /* ... */ } );

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

    WorkspaceUsers.onlineAll( app, '/workspace/:workspaceId/users', ':_id' );

This is enough to create a store that will respond to `GET /workspace/2222/users/3333` (to fetch user 3333 from workspace 2222), `GET /workspace/2222/users` (to get all users of workspace 2222), and so on.

* Queries will _always_ honour the filter on `workspaceId`, both in queries and single-record operations.
* Fields listed in `paramIds` need to be also listed in the store's schema
* The second parameter of `onlineAll()` needs to include all `paramIds` except the last one
* The third parameter of `onlineAll()` needs to include the field that will be used as unique ID
* The third parameter actually needs to identify unique records in the table

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

      storeName:  'WorkspaceUsers',
      paramIds: [ 'workspaceId', '_id' ],
    });
    WorkspaceUsers.onlineAll( app, '/workspace/:workspaceId/users/', ':_id' );

    var UserWorkspaces = declare( WorkspacesUsersBase, {

      handlePut: false,
      handlePost: true,
      handleGet: false,
      handleGetQuery: true,
      handleDelete: true,

      storeName:  'UserWorkspaces',
      paramIds: [ 'userId', '_id' ],
    });
    UserWorkspaces.onlineAll( app, '/user/:userId/workspaces/', '_id' );

That's it! You didn't have to re-define the schema again. Both stores inherit from `WorkspacesUsersBase`, but mark some differences:

* `handleXXX` entries are different.
* `storeName` is different . Each store needs to have a unique name.
* `paramIds` elements, as well as route strings, are different

The last difference is what makes the stores truly uniques: in `WorkspaceUsers`, when querying for example `GET /workspace/2222/users/`, JsonRestStores will filter the results so that only records where `workspaceId` is `2222` will be returned; in `UserWorkspaces`, when querying for example `GET /user/3333/workspaces`, only records where `userId` is `3333` will be returned.

The beauty of it is that you only had to define the schema once; the two different variations can be as similar, or as different, to the "base" store as you like.

Finally, note that the derived stores `WorkspaceUsers` and `UserWorkspaces` only allow `Post` (adding new entries), `GetQuery` and `Delete`.

# Important hooks: permissions and "after" hooks

## Permissions

iBy default, everything is allowed: stores allow pretty much anything and anything; anybody can DELETE, PUT, POST, etc. Furtunately, JsonRestStores allows you to decide exactly what is allowed and what isn't, by overriding specific methods.

Each permission function needs to call the callback: if everything went fine, `cb()` will be called with `cb( null, true )`; to fail, `cb( null, false )`.

Here are the functions:

 * `checkPermissionsPost( params, body, options, cb )` 
 * `checkPermissionsPostAppend( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsPutNew( params, body, options, cb )`
 * `checkPermissionsPutExisting( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsGet( params, body, options, doc, fullDoc, cb )`
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

    WorkspaceUsers.onlineAll( app, '/workspace/:workspaceId/users', ':_id' );

Permission checking can be as simple, or as complex, as you need it to be.

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

TODO

# Errors returned and error management

This is the comprehensive list of errors the class can throw:

  * `BadRequestError`
  * `UnauthorizedError`
  * `ForbiddenError`
  * `NotFoundError`
  * `PreconditionFailedError`
  * `UnprocessableEntityError`
  * `NotImplementedError`
  * `ServiceUnavailableError`


TODO: describe what errors can actually contain, the whole "chaining" thing, etc. as well as error formatting functions and logger
From OLD doc:

 * `formatErrorResponse( error )` (Function to format the response in case of errors)
 * `logError( error )` (Function called every time an error occurs)
 *  chainErrors ('none': never call `next(err)`, 'nonhttp': only call `next(err)` for non-http errors, 'all': always call `next(err)`


# Store APIs

JsonRestStores allows you to run methods from within your programs, rather than accessing them via URL. This is very helpful if you need to query a store within your own programs.
This is achieved with the following class functions:

* `Store.Get( id, options, next )`
* `Store.GetQuery( options, next )`
* `Store.Put( id, body, options, next )`
* `Store.Post( body, options, next )`
* `Store.PostAppend( id, body, options, next )`
* `Store.Delete( id, options, next )`

All normal hooks are called when using these functions. However:

* The `paramIds` array is shortened so that it only has its last element. This means that you are free to query a store without any pre-set limitations imposed by `paramIds`
* All `request.handleXXX` are set to `true`
* The `request.remote` variable is set to false

The last item is especially important: when developing your own permission model, you will probably want to make sure you have different permissions for local requests and remote ones (or, more often, have no restrictions for local ones since you are the one initiating them).

TODO: explain `options` in detail, and in fact check that it makes sense to have it every single time. ADD EXAMPLE!

# Developing a driver layer

The Store class itself is database-agnostic: it uses a set of functions to perform operations that require access to the database.
Such functions all start with the name `driver` and are:

* `driverAllDbFetch( params, body, options, cb )` (fetch a document)
* `driverGetDbQuery( params, body, options, cb )` (executes the query)
* `driverPutDbInsert( params, body, options, cb )`(inserts a record in the DB after a PUT)
* `driverPutDbUpdate( params, body, options, doc, fullDoc, cb )`(updates a record in the DB after a PUT)
* `driverPostDbInsertNoId( params, body, options, generatedId, cb  )`(adds a new record to the DB; a new ID will be created)
* `driverPostDbAppend( params, body, options, doc, fullDoc, cb )` (appends information to existing record via POST)
* `driverDeleteDbDo( params, body, options, id, cb )`(deletes a record)

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



# TODO

* In documentation about the MongoMixin, describe `collectionName` and how the unique ID doesn't need to be `_id` (the driver will create an `_id` record on its own)

* Describe queryFilterType

* Describe `extrapolateDoc( params, body, options, fullDoc, cb )`(from the fetched document, extrapolate the data you actually want)
* Describe `prepareBeforeSend( doc, cb )`(manipulate a record jut before sending it back to the client)

* Document how to use this.inheritedSync(arguments, cb) after testing and checking

