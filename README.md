JsonRestStores
==============

JsonRestStores is a one-stop module that allows you to create fully functional, configurable Json REST stores using NodeJS. A store can be inherited from another store, and can define all sorts of hooks to configure how it behaves.

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





# Developing a driver layer

_TODO: Change the DB layer so that only necessary parameters are passed, because this is just plain silly_

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

* You can see that all functions always have `params, body, options` as first parameters, even though they don't always make sense (in a `DELETE` operation, there is no "body" posted). This is only to keep the codebase sane: `driverDeleteDbDo()` will safely ignore `body` (always passed empty) and `options` (which only apply to search fiters).

* The functions `driverPutDbUpdate()` and `driverPostDbAppend()` both work on existing records; they have as parameters `doc` and `fullDoc`, which represent the record _before_ the change; `doc` is basically `fullDoc` after `extrapolateDoc()` is run. 

# Errors thrown and error management

This is the comprehensive list of errors the class can throw:

  * BadRequestError
  * UnauthorizedError
  * ForbiddenError
  * NotFoundError
  * PreconditionFailedError
  * UnprocessableEntityError
  * NotImplementedError
  * ServiceUnavailableError

TODO: describe what errors can actually contain, the whole "chaining" thing, etc. as well as error formatting functions and logger
From OLD doc:

 * `formatErrorResponse( error )` (Function to format the response in case of errors)
 * `logError( error )` (Function called every time an error occurs)
 *  chainErrors ('none': never call `next(err)`, 'nonhttp': only call `next(err)` for non-http errors, 'all': always call `next(err)`



# Permissions

In permission functions, `cb()` will be called with `cb( null, true )` if granted, `cb( null, false )` for not granted.

 * `checkPermissionsPost( params, body, options, cb )` 
 * `checkPermissionsPostAppend( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsPutNew( params, body, options, cb )`
 * `checkPermissionsPutExisting( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsGet( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsDelete( params, body, options, doc, fullDoc, cb )`


# "After" hooks




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






# NOTES

* In documentation about the MongoMixin, describe `collectionName` and how the unique ID doesn't need to be `_id` (the driver will create an `_id` record on its own)

* Describe queryFilterType

# DO NOT READ BEHOND THIS POINT. DOCUMENTATION IS BEING WRITTEN RIGHT NOW, AND WHAT FOLLOWS IS MOST DEFINITELY OUTDATED AND VERY VERY WRONG



# What actually happend


Basically, an object of type `PeopleStore` was created, and its method `_makeGet()` was called passing it `req`, `res`, `next`. It's important to create a new object: even though the library itself doesn't define any object attributes, user defined method might well do. If the module used the same object for every request, all requests would share the same namespace.

The method `_makeGet()` is a general method that handles GET requests. In your application, you will need the method to do very specialised things. That's why `_makeGet()` (but allso all of the others: `_makePut()`, `_makePost()`, etc. ) do everything using class functions that you will most definitely override. (Note that you don't _have to_ override them: no override will give you a fully functional, "default" store).


# Behind the scenes

This is the list of functions that actually do the work behind the scenes:

 * `_makeGet()` (implements GET for one single document)
 * `_makeGetQuery()` (implements GET for a collection, no ID passed)
 * `_makePut()` (implements PUT for a collection)
 * `_makePost()` (implements POST for a collection)
 * `_makePostAppend()` (implements POST for a collection, when ID is present)
 * `_makeDelete()` (implements DELETE for a collection)


## Analysis of a inner function: `_makeGet()`

This is what happens in `_makeGet()`. Once you understand this, it's actually quite trivial to see the code of the module to figure out what the others do too:

* **Checks that `self.handleGet` is true** If not, the method is not actually allowed.

* **Runs `self._checkParamIds( params, body, errors )`**. This will cast `params` so that each field listed in the `paramIds` array is cast and checked fully. Since elements in `paramIds` are the ones in the URL, it's important that this check is done beforehand.

* **Runs `self.driverAllDbFetch()**. The record is fetched. It's important that the _whole_ record is fetched by this function.

* **Runs `self.extrapolateDoc()`**. This is important as in some cases you only want a sub-section of the fetched record (for example, only a bunch of fields or the result of `JSON.parse()` of a specific field, etc. Basically, this turns whatever was fetched from the DB into whatever you want returned.

* **Runs `self.checkPermissionsGet()`** This is obviously the function that will check permissions

* **Runs `self.afterGet()`**. This is a hook called "after" everything is done in terms of send. However, it's called *before* sending the response to the client. So, it can still make things fail if needed.

* **Runs `self.prepareBeforeSend()`**. This is a "preparation" function: a function that can manipulate the item just before sending it

* **SEND item to client**





# TECHNICAL INFO (not needed to use the class, but important for DB-layer developers)

At this point, you are aware that there are six crucial methods for each store:

**Manipulation functions**  
 * `extrapolateDoc( params, body, options, fullDoc, cb )`(from the fetched document, extrapolate the data you actually want)
 * `prepareBeforeSend( doc, cb )`(manipulate a record jut before sending it back to the client)


**Redefinable after-op functions** 
 * `afterPutNew( req, body, doc, fullDoc, overwrite, cb )` (Called after a new record is PUT)
 * `afterPutExisting( req, body, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb )` (After a record is overwritten with PUT)
 * `afterPost( req, body, doc, fullDoc, cb )` (After a new record is POSTed)
 * `afterPostAppend( req, body, doc, fullDoc, docAfter, fullDocAfter, cb )` (After an existing record is POSTed)
 * `afterDelete( req, doc, fullDoc cb )` (After a record is deleted)
 * `afterGet( req, doc, fullDoc, cb )` (After a record is retrieved)

**Redefinable generic functions** 
Note that the `MongoStore` module already _does_ overrides the **Database functions** (which would normally be redefined by you), in order to give a working store for you to enjoy. Your own overriding functions could be heavily inspired by these.

# What happens in each call

JsonRestStores does all of the boring stuff for you -- the kind things that you would write over and over and over again while developing a server store.

When using JsonRestStores, you are likely to 1) Use a specialised store 2) Redefine the functions marked above as **IMPORTANT: Database functions**. However, in order to really get it right, it's important to know what actually happens in each call.

