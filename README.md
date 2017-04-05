JsonRestStores
==============

JsonRestStores is the best way to create **self-documenting** REST stores that return JSON data (yes: self-documenting!). JsonRestStores is in RC3 status, and the API is 100% locked. Please (find and) file bugs and requests as issues against this repo.

Rundown of features:

* **DRY approach**. Create complex applications keeping your code short and tight, without repeating yourself.
* **Down-to-earth**. It does what developers _actually_ need, using existing technologies.
* **Database-agnostic**. You can either use a generic database connector, or implement the (simple!) data-manipulation methods yourself.
* **Protocol-agnostic**. For now, only HTTP is implemented. However, with JsonRestStores the protocol used to make REST calls doesn't actually matter.
* **Schema based**. Anything coming from the client will be validated and cast to the right type.
* **File uploads**. It automatically supports file uploads, where the field will be the file's path
* **API-ready**. Every store function can be called via API, which bypass permissions constraints
* **Tons of hooks**. You can hook yourself to every step of the store processing process: `afterValidate()`,   `afterCheckPermissions()`, `afterDbOperation()`, `afterEverything()`
* **Authentication hooks**. Only implement things once, and keep authentication tight and right.
* **Mixin-based**. You can add functionality easily.
* **Inheriting stores**. You can easily derive a store from another one.
* **Nested data**. Automatically load all child records and lookup records from other stores.
* **Simple error management**. Errors can be chained up, or they can make the store return them to the client.
* **Great documentation**. Every aspect of JsonRestStores is carefully explained and documented. Note that every day usage doesn't require knowlege of every single aspect of JsonRestStores.

JsonRestStores even comes with its own database layer mixin, SimpleDbLayerMixin, which will implement all of the important methods that will read, write and delete elements from a database. The mixin uses [simpledblayer](https://github.com/mercmobily/simpledblayer) to access the database. For now, only MongoDb is supported but more will surely come.


# Introduction to (JSON) REST stores

Here is an introduction on REST, JSON REST, and this module. If you are a veteran of REST stores, you can probably just skim through this.

## Implementing REST stores

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

And then -- again -- to get/post data from individual fields with one call:

* `GET /bookings/:bookingId/users/:userId/field1`
* `PUT /bookings/:bookingId/users/:userId/field1`
* `GET /bookings/:bookingId/users/:userId/field2`
* `PUT /bookings/:bookingId/users/:userId/field2`
* `GET /bookings/:bookingId/users/:userId/field3`
* `PUT /bookings/:bookingId/users/:userId/field3`

It sounds simple enough (although it's only two tables and it already looks rather boring). It gets tricky when you consider that:

* You need to make sure that permissions are always carefully checked. For example, only users that are part of booking `1234` can `GET /bookings/1234/users`
* When implementing `GET /bookings/`, you need to parse the URL in order to enable data filtering (for example, `GET /bookings?dateFrom=1976-01-10&name=Tony` will need to filter, on the database, all bookings made after the 10th of January 1976 by Tony).
* When implementing `GET /bookings/`, you need to return the right `Content-Range` HTTP headers in your results so that the clients know what range they are getting.
* When implementing `GET /bookings/`, you also need to make sure you take into account any `Range` header set by the client, which might only want to receive a subset of the data
* When implementing `/bookings/:bookingId/users/:userId`, you need to make sure that the bookingId exists
* With `POST` and `PUT`, you need to make sure that data is validated against some kind of schema, and return the appropriate errors if it's not.
* With `PUT`, you need to consider the HTTP headers `If-match` and `If-none-match` to see if you can//should//must overwrite existing records
* All unimplemented methods should return a `501 Unimplemented Method` server response
* You need to implement all of the routes for individual fields, and add permissions

This is only a short list of obvious things: there are many more to consider. The point is, when you make a store you should be focusing on the important parts (the data you gather and manipulate, and permission checking) rather than repetitive, boilerplate code.

With JsonRestStores, you can create JSON REST stores without ever worrying about any one of those things. You can concentrate on what _really_ matters: your application's data, permissions and logic.

## Understand a little about REST stores

If you are new to REST and web stores, you will probably benefit by reading a couple of important articles. Understanding the concepts behind REST stores will make your life easier.

I suggest you read [John Calcote's article about REST, PUT, POST, etc.](http://jcalcote.wordpress.com/2008/10/16/put-or-post-the-rest-of-the-story/). It's a fantastic read, and I realised that it was written by John, who is a long term colleague and fellow writer at Free Software Magazine, only after posting this link here!

You should also read my small summary of [what a REST store actually provides](https://github.com/mercmobily/JsonRestStores/blob/master/jsonrest.md).

At this stage, the stores are 100% compatible with [Dojo's JsonRest](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html) as well as [Sitepen's dstore](http://dstorejs.io/).

# Dependencies overview

Jsonreststores is a module that creates managed routes for you, and integrates very easily with existing ExpressJS applications.

Here is a list of modules used by JsonRestStores. You should be at least slightly familiar with them.

* [SimpleDeclare - Github](https://github.com/mercmobily/SimpleDeclare). This module makes creation of constructor functions/classes a breeze. Using SimpleDeclare is a must when using JsonRestStores -- unless you want to drown in unreadable code.

* [SimpleSchema - Github](https://github.com/mercmobily/SimpleSchema). This module makes it easy (and I mean, really easy) to define a schema and validate/cast data against it. It's really simple to extend a schema as well. It's a no-fuss module.

* [Allhttperrors](https://npmjs.org/package/allhttperrors). A simple module that creats `Error` objects for all of the possible HTTP statuses.

* [SimpleDbLayer](https://github.com/mercmobily/simpledblayer). The database layer used to access the database

Note that all of these modules are fully unit-tested, and are written and maintained by me.

**It is recommended that you have a working knowledge of SimpleDbLayer (focusing on querying and automatic loading of children) before delving too deep into JsonRestStores, as JsonRestStores uses the same syntax to create queries and to define nested layers.**

# Your first Json REST store

Creating a store with JsonRestStores is very simple. Here is how you make a fully compliant store, ready to be added to your Express application:

      var JsonRestStores = require('jsonreststores'); // The main JsonRestStores module
      var Schema = require('simpleschema');  // The main schema module
      var SimpleDbLayer = require('simpledblayer');
      var MongoMixin = require('simpledblayer-mongo')
      var declare = require('simpledeclare');

      // The DbLayer constructor will be a mixin of SimpleDbLayer (base) and
      // MongoMixin (providing mongo-specific driver to SimpleDbLayer)
      var DbLayer = declare( SimpleDbLayer, MongoMixin, { db: db } );

      // Basic definition of the managers store
      var Managers = declare( JsonRestStores, JsonRestStores.HTTPMixin, JsonRestStores.SimpleDbLayerMixin, {

        // Constructor class for database-access objects, which in this case
        // will access MongoDNB collections
        DbLayer: DbLayer,

        schema: new Schema({
          name   : { type: 'string', trim: 60 },
          surname: { type: 'string', searchable: true, trim: 60 },
        }),

        storeName: 'managers',
        publicURL: '/managers/:id',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,
      });

      var managers = new Managers();

      JsonRestStores.init();
      managers.protocolListen( 'HTTP', { app: app } );;

Note that since you will be mixing in `JsonRestStores` with `JsonRestStores.HTTPMixin` and `JsonRestStores.SimpleDbLayerMixin` for every single store you create (more about mixins shortly), you might decide to create the mixin once for all making the code less verbose:

    var JsonRestStores = require('jsonreststores'); // The main JsonRestStores module
    var Schema = require('simpleschema');  // The main schema module
    var SimpleDbLayer = require('simpledblayer');
    var MongoMixin = require('simpledblayer-mongo')
    var declare = require('simpledeclare');

    // The DbLayer constructor will be a mixin of SimpleDbLayer (base) and
    // MongoMixin (providing mongo-specific driver to SimpleDbLayer)
    var DbLayer = declare( SimpleDbLayer, MongoMixin, { db: db } );

    // Mixin of JsonRestStores, JsonRestStores.HTTPMixin and JsonRestStores.SimpleDbLayerMixin
    // with the DbLayer parameter already set
    var Store = declare( JsonRestStores, JsonRestStores.HTTPMixin, JsonRestStores.SimpleDbLayerMixin, { DbLayer: DbLayer } );

    // Basic definition of the managers store
    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', searchable: true, trim: 60 },
      }),

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });

    var managers = new Managers();

    JsonRestStores.init();
    protocolListen( 'HTTP', { app: app } );

That's it: this is enough to add, to your Express application, a a full store which will handly properly all of the HTTP calls.

* `Managers` is a new constructor function that inherits from `JsonRestStores` (the main constructor for JSON REST stores) mixed in with `JsonRestStores.HTTPMixin` (which ensures that `protocolListen()` works with the `HTTP` parameter, allowing clients to connect using HTTP) and `JsonRestStores.SimpleDbLayerMixin` (which gives `JsonRestStores` the ability to manipulate data on a database automatically).
* `DbLayer` is a SimpleDbLayer constructor mixed in with `MongoMixin`, the MongoDB-specific layer for SimpleDbLayer. So, `DbLayer` will be used by `Managers` to manipulate MongoDB collections.
* `schema` is an object of type Schema that will define what's acceptable in a REST call.
* `publicURL` is the URL the store is reachable at. ***The last one ID is the most important one***: the last ID in `publicURL` (in this case it's also the only one: `id`) defines which field, within your schema, will be used as _the_ record ID when performing a PUT and a GET (both of which require a specific ID to function).
* `storeName` (_mandatory_) needs to be a unique name for your store.
* `handleXXX` are attributes which will define how your store will behave. If you have `handlePut: false` and a client tries to PUT, they will receive an `NotImplemented` HTTP error.
* `protocolListen( 'HTTP', { app: app } )` creates the right Express routes to receive HTTP connections for the `GET`, `PUT`, `POST` and `DELETE` methods.
* `JsonRestStores.init()` should _always_ be run once you have declared all of your stores. This function will run the initialisation code necessary to make nested stores work properly.

## The store live in action in your express application

JsonRestStores is very unobtrusive of your Express application. In order to make everything work, you can just:

 * Generate a new ExpressJS application
 * Connect to the database
 * Define the stores using the code above.

This is how the stock express code would change to implement the store above (please note that this is mostly code autogenerated when you generate an Express application):

    var express = require('express');
    var path = require('path');
    var favicon = require('serve-favicon');
    var logger = require('morgan');
    var cookieParser = require('cookie-parser');
    var bodyParser = require('body-parser');

    var routes = require('./routes/index');
    var users = require('./routes/users');

    var app = express();

    // CHANGED: ADDED AN INCLUDE `dbConnect`
    var dbConnect = require('./dbConnect');

    // view engine setup
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'jade');

    // uncomment after placing your favicon in /public
    //app.use(favicon(__dirname + '/public/favicon.ico'));
    app.use(logger('dev'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'public')));

    app.use('/', routes);
    app.use('/users', users);

    // CHANGED: Added call to dbConnect, and waiting for the db
    dbConnect( function( db ){

      // ******************************************************
      // ********** CUSTOM CODE HERE **************************
      // ******************************************************

      var JsonRestStores = require('jsonreststores'); // The main JsonRestStores module
      var Schema = require('simpleschema');  // The main schema module
      var SimpleDbLayer = require('simpledblayer');
      var MongoMixin = require('simpledblayer-mongo')
      var declare = require('simpledeclare');

      // The DbLayer constructor will be a mixin of SimpleDbLayer (base) and
      // MongoMixin (providing mongo-specific driver to SimpleDbLayer)
      var DbLayer = declare( SimpleDbLayer, MongoMixin, { db: db } );

      // Common mixin of JsonRestStores, JsonRestStores.SimpleDbLayerMixin and the DbLayer parameter
      // already set

      var Store = declare( JsonRestStores, JsonRestStores.SimpleDbLayerMixin, { DbLayer: DbLayer } );

      var Managers = declare( Store, {

        schema: new Schema({
          name   : { type: 'string', trim: 60 },
          surname: { type: 'string', searchable: true, trim: 60 },
        }),

        storeName: 'managers',
        publicURL: '/managers/:id',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,
      });
      var managers = new Managers();

      JsonRestStores.init();
      managers.protocolListen( 'HTTP', { app: app } );;

      // ******************************************************
      // ********** END OF CUSTOM CODE      *******************
      // ******************************************************

      // catch 404 and forward to error handler
      app.use(function(req, res, next) {
          var err = new Error('Not Found');
          err.status = 404;
          next(err);
      });

      // error handlers

      // development error handler
      // will print stacktrace
      if (app.get('env') === 'development') {
          app.use(function(err, req, res, next) {
              res.status(err.status || 500);
              res.render('error', {
                  message: err.message,
                  error: err
              });
          });
      }

      // production error handler
      // no stacktraces leaked to user
      app.use(function(err, req, res, next) {
          res.status(err.status || 500);
          res.render('error', {
              message: err.message,
              error: {}
          });
      });


    });
    module.exports = app;

The `dbConnect.js` file is simply something that will connect to the database and all the callback with the `db` instance:

    var mongo = require('mongodb');
    exports = module.exports = function( done ){
      // Connect to the database
      mongo.MongoClient.connect('mongodb://localhost/storeTesting', {}, function( err, db ){
        if( err ){
          console.error( "Error connecting to the database: ", err );
          process.exit( 1 );
        }
        return done( db );
      });
    }

This store is _actually_ fully live and working! It will manipulate your database and will respond to any HTTP requests appropriately.

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


    $ curl -i -GET  http://localhost:3000/managers/?surname=mobily
    HTTP/1.1 200 OK
    X-Powered-By: Express
    Content-Type: application/json; charset=utf-8
    Content-Length: 136
    ETag: "15729456527"
    Date: Mon, 02 Dec 2013 02:22:35 GMT
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

    $ curl -i -GET  http://localhost:3000/managers/?surname=fabbietti
    HTTP/1.1 200 OK
    X-Powered-By: Express
    Content-Type: application/json; charset=utf-8
    Content-Length: 2
    ETag: "1455673456"
    Date: Mon, 02 Dec 2013 02:22:42 GMT
    Connection: keep-alive

    []

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

## Clarification on mixins

Mixins are a powerful way to specialise a generic constructor.

For example, the constructor `JsonRestStores` on its own is hardly useful as it doesn't allow you to wait for request and actually serve them. On its own, calling `protocolListen( 'HTTP', { app: app } );` will fail, because `protocolListen()` will attempt to run the method `protocolListenHTTP( { app: app } )`, which isn't defined.

The good news is that the mixin `JsonRestStores.HTTPMixin` implements `protocolListenHTTP()` (as well as the corresponding `protocolSendHTTP()`), which makes `protocolListen( 'HTTP', { app: app } );` work.

You can mix a store with as many protocol mixins as you like (although at this stage only HTTP is currently implemented).

`HTTPMixin` is only one piece of the puzzle: on its own, it's not enough. JsonRestStores mixed with `HTTPMixin`
 creates JSON REST stores with the following data-manipulation methods left unimplemented (they will throw an error if they are run):

 * `implementFetchOne: function( request, cb )`
 * `implementInsert: function( request, forceId, cb )`
 * `implementUpdate: function( request, deleteUnsetFields, cb )`
 * `implementDelete: function( request, cb )`
 * `implementQuery: function( request, next )`
 * `implementReposition: function( doc, where, beforeId, cb )`

Implementing these methods is important to tell `JsonRestStores` how to actualy manipulate the store's data. [You can do it yourself by hand](#naked-non-database-stores), but if you want to save a few hundred hours, this is exactly what `JsonRestStores.SimpleDbLayerMixin` does: it's a mixin that enriches the basic `JsonRestStore` objects with all of the methods listed above, using a database as data storage.

So when you write:

    var Managers = declare( JsonRestStores, JsonRestStores.HTTPMixin, JsonRestStores.SimpleDbLayerMixin, {

You are creating a constructor, `Managers`, mixing in the prototypes of `JsonRestStores` (the generic, unspecialised constructor for Json REST stores), `HTTPMixin` (which makes `protocolListen( 'HTTP', { app: app } );` work) and `JsonRestStores.SimpleDbLayerMixin` (which provides the implementations of `implementFetchOne()`, `implementInsert()`, etc. to manipulate data).

`SimpleDbLayerMixin` will use the `DbLayer` attribute of the store as the constructor used to create "table" objects, and will manipulate data with them.

`DbLayer` itself is created using the same pattern as `Managers`.

SimpleDbLayer on its own is useless: it creates a DB layer with the following methods left unimplemented:

* `select( filters, options, cb )`
* `update( conditions, updateObject, options, cb )`
* `insert( record, options, cb )`
* `delete( conditions, options, cb )`
* `reposition: function( record, where, beforeId, cb )`

The implementation will obviously depend on the database layer. So, when you type:

    var DbLayer = declare( SimpleDbLayer, MongoMixin );

You are creating a constructor, `DbLayer`, that is the mixin of `SimpleDbLayer` (where `select()` `update()` etc. are not implemented) and `MongoMixin` (which implements `select()`, `update()` etc. using MongoDB as the database layer).

This is the beauty of mixins: they implement the missing methods in a generic, unspecialised constructor.

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

    var Managers = declare( Store, {

      schema: new Schema({
        id     : { type: 'id' },
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', trim: 60 },
      }),

      storeName: 'managers',
      paramIds: [ 'id' ],

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      hardLimitOnQueries: 50,
    });

    var managers = new Managers();
    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );; // This will throw()

Note that:
 * The `id` parameter had to be defined in the schema
 * The `paramIds` array had to be defined by hand
 * `managers.protocolListen( 'HTTP', { app: app } );` can't be used as the public URL is not there

This pattern is much more verbose, and it doesn't allow the store to be placed online with `protocolListen()`.

In any case, the property `idProperty` is set as last element of `paramIds`; in this example, it is `id`.

In the documentation, I will often refers to `paramIds`, which is an array of element in the schema which match the ones in the route. However, in all examples I will declare stores using the "shortened" version.

# Nested stores

Stores are never "flat" as such: you have workspaces, and then you have users who "belong" to a workspace. Here is how you create a "nested" store:

    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', searchable: true, trim: 60 },
      }),

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });
    var managers = new Managers();

    var ManagersCars = declare( Store, {

      schema: new Schema({
        make     : { type: 'string', trim: 60, required: true },
        model    : { type: 'string', trim: 60, required: true },
      }),

      storeName: 'managersCars',
      publicURL: '/managers/:managerId/cars/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });
    var managersCars = new ManagersCars();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;
    managersCars.protocolListen( 'HTTP', { app: app } );;

You have two stores: one is the simple `managers` store with a list of names and surname; the other one is the `managersCars` store: note how the URL for `managersCars` includes `managerId`.

The managersCars store will will respond to `GET /managers/2222/cars/3333` (to fetch car 3333 of manager 2222), `GET /workspace/2222/users` (to get all cars of manager 2222), and so on.

Remember that in `managersCars` _remote queries will **always** honour the filter on `managerId`, both in queries (`GET` without an `id` as last parameter) and single-record operations_ (`GET` with a specific `id`). This happens thanks to SimpleDbLayerMixin (more about this later).

## Fetching children records automatically in nested stores

If you have two nested tables like the ones shown above, you might want to be able to look up fields automatically. JsonRestStores allows you to to so using the `nested` property.

For example:

    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', searchable: true, trim: 60 },
      }),

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      nested: [
        {
          type: 'multiple',
          store: 'managersCars',
          join: { managerId: 'id' },
        }
      ],

    });
    var managers = new Managers();

    var ManagersCars = declare( Store, {

      schema: new Schema({
        make     : { type: 'string', trim: 60, required: true },
        model    : { type: 'string', trim: 60, required: true },
      }),

      storeName: 'managersCars',
      publicURL: '/managers/:managerId/cars/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      nested: [
        {
          type: 'lookup',
          localField: 'managerId',
          store: 'managers',
        }
      ],
    });
    var managersCars = new ManagersCars();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;
    managersCars.protocolListen( 'HTTP', { app: app } );;

This is an example where using JsonRestStores really shines: when you use `GET` to fetch a manager, the object's attribute `manager._children.managersCars` will be an array of all cars joined to that manager. Also, when you use `GET` to fetch a car, the object's attribute `car._children.managerId` will be an object representing the correct manager. This is immensely useful in web applications, as it saves tons of HTTP calls for lookups. **NOTE**: The child's store's `extrapolateDoc()` and `prepareBeforeSend()` methods _will_ be called on the child's data (as you would expect). Keep in mind that when those methods are being called on bested data, `request.nested` will be set to true.

Note that in `nested` objects the store names are passed as _strings_, rather than objects; this is important: in this very example, you can see `store: 'managersCars',` as a nested store, but at that point `managersCars` hasn't been declared yet. The store names in `nested` will be resolved later, by the `JsonRestStores.init()` function, using JsonRestStores' registry for the lookup. This is why it's crucial to run `JsonRestStores.init()` only when _all_ of your stores have been created (and are therefore in the registry).

Fetching of nested data is achieved by SimpleDbLayerMixin by using [SimpleDbLayer's nesting abilities](https://github.com/mercmobily/simpledblayer#automatic-loading-of-children-joins), which you should check out. If you do check it out, you will see strong similarities between JsonRestStores' `nested` parameter and `SimpleDbLayer`. If you have used nested parameters in SimpleDbLayer, then you easily see that  JsonRestStores will simply make sure that the required attribute for `nested` entries are there; for each `nested` entry it will add a `layer` property (based on the store's own `collectionName`) and a `layerField` property (based on the store's own `idProperty`).

You can change the name of the property in `_children` by adding a `prop` parameter to nested:

    nested: [
      {
        type: 'lookup',
        localField: 'userId',
        store: 'usersPrivateInfo',
        prop: 'usersPrivateInfo'
      },

      {
        type: 'lookup',
        localField: 'userId',
        store: 'usersContactInfo',
        prop: 'usersContactInfo'
      }

    ],

This proves useful when there is a clash. In this case, the `userId` field is used twice: once to pull information from `usersPrivateInfo`  and again to pull information from `usersContactInfo`.

# Naming conventions for stores

It's important to be consistent in naming conventions while creating stores. In this case, code is clearer than a thousand bullet points:

## Naming convertions for simple stores

    var Managers = declare( Store, {

      schema: new Schema({
        // ...
      });

      publicUrl: '/managers/:id',

      storeName: `managers`
      // ...
    }
    var managers = new Managers();

    var People = declare( Store, {

      schema: new Schema({
        // ...
      });

      publicUrl: '/people/:id',

      storeName: `people`
      // ...
    }
    var people = new People();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;
    people.protocolListen( 'HTTP', { app: app } );;

* Store names anywhere lowercase and are plural (they are collections representing multiple entries)
* Irregulars (`Person` => `People`) are a fact of life
* Store constructors (derived from `Store`) are in capital letters (as constructors, they should be)
* Store variables are in small letters (they are normal object variables)
* `storeName` attributes are in small letters (to follow the lead of variables)
* URL are in small letters (following the stores' names, since everybody knows that `/Capital/Urls/Are/Silly`)

## Naming conventions for nested stores

    var Managers = declare( Store, {

      schema: new Schema({
        // ...
      });

      publicUrl: '/managers/:id',

      storeName: `managers`
      // ...
    }
    var managers = new Managers();

    var ManagersCars = declare( Store, {

      schema: new Schema({
        // ...
      });

      publicUrl: '/managers/:managerId/cars/:id',

      // ...
      storeName: `managersCars`
      // ...
    }
    var managerCars = new ManagersCars();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;
    managerCars.protocolListen( 'HTTP', { app: app } );;


* The nested store's name starts with the parent store's name (`managers`) keeping pluralisation
* The URL is in small letters, starting with the URL of the parent store

# Permissions

By default, everything is allowed: stores allow pretty much anything and anything; anybody can DELETE, PUT, POST, etc. Furtunately, JsonRestStores allows you to decide exactly what is allowed and what isn't, by overriding specific methods.

Every method runs the method `checkPermissions()` before continuing. If everything went fine, `checkPermissions()` will call the callback with `true`: `cb( null, true )`; otherwise, to fail, `cb( null, false )`.

The `checkPermissions()` method has the following signature:

    checkPermissions: function( request, method, cb )

Here:

* `request`. It is the request object
* `method`. It can be `post`, `put`, `get`, `getQuery`, `delete`

Here is an example of a store only allowing deletion only to specific admin users:

    // The basic schema for the WorkspaceUsers table
    var WorkspaceUsers = declare( Store, {

      schema: new Schema({
        email     :  { type: 'string', trim: 128, searchable: true, sortable: true  },
        name      :  { type: 'string', trim: 60, searchable: true, sortable: true  },
      }),

      storeName:  'WorkspaceUsers',
      publicURL: '/workspaces/:workspaceId/users/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      checkPermissions: function( request, method, cb ){

        // This will only affect `delete` methods
        if( method !== 'delete' ) return cb( null, true );

        // User is logged in: all good
        if( request._req.session.user ){
          cb( null, true );

        // User is not logged in: fail!
        } else {
          cb( null, false, "Must login" );
        }
      },

    });
    var workspaceUsers = new WorkspaceUsers();
    workspaceUsers.protocolListen( 'HTTP', { app: app } );;

Permission checking can be as simple, or as complex, as you need it to be.

Note that if your store is derived from another one, and you want to preserve your master store's permission model, you can run `this.inheritedAsync(arguments)` like so:

      checkPermissions: function f( request, method, cb ){

        this.inheritedAsync( f, arguments, function( err, granted, message ) {
          if( err ) return cb( err, false );

          // The parent's checkPermissions() method failed: this will honour that fail
          if( ! granted) return cb( null, false, message );

          // This will only affect `delete` methods
          if( method !== 'delete' ) return cb( null, true );

          // User is admin (id: 1 )
          if( request._req.session.user === 1){
            cb( null, true );

          // User is not logged in: fail!
          } else {
            cb( null, false, "Must login" );
          }
       }
     },

This will ensure that the inherited `checkPermissionsDelete()` method is called and followed, and _then_ further checks are carried on.

Please note that `checkPermissions()` is only run for local requests, with `remote` set to false. All requests coming from APIs will ignore the method.

# Single fields

Advanced applications allow users to make a PUT call as soon as they leave a field, rather than on submit of the whole form. To facilitate this, JsonRestStores implements "single fields", where `get` and `put` calls will only affect a single field -- and yet you get all of the authentication bonus from

So do that, all you have to do is mark fields as `singleField` in your schema -- that's it!
For example:

    // Basic definition of the managers store
    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60, singleField: true },
        surname: { type: 'string', searchable: true, trim: 60, singleField: true },
      }),

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });

    var managers = new Managers();

    JsonRestStores.init();
    protocolListen( 'HTTP', { app: app } );

In this case you are able to GET and PUT the field `name`, marked as `singleField`, individually.
For example HTTPMixin will create the following routes:

* GET /managers/:id/name
* PUT /managers/:id/name
* GET /managers/:id/surname
* PUT /managers/:id/surname

Note that _all_ of the permissions checks and hooks will be called as per normal for `put` and `get` requests. If you need to differenciate in your code, you can simply check for the `request.options.field` property.

# Unique fields

You can add the `unique` attribute to a field in the schema; this will ensure that PUT and POST operations will never allow duplicate data within the same store.

For example:

    // Basic definition of the managers store
    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60, singleField: true },
        surname: { type: 'string', searchable: true, trim: 60, singleField: true },
        email  : { type: 'string', searchable: true, unique: 'true', trim: 60, singleField: true },
      }),

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });

    var managers = new Managers();

    JsonRestStores.init();
    protocolListen( 'HTTP', { app: app } );

In this case, JsonRestStores will ensure that `email` is unique. Note that you should also do this at index-level, and that JsonRestStores does a _soft_ check. This means that it won't handle race conditions where two concurrent calls might end up checking for the duplicate at the same time, and therefore allowing a duplicate record. So, generally speaking, if it's crucial that your app doesn't have a duplicate you will _need_ to enforce this at index-level.

Remember that all fields marked as `unique` must also be declared as `searchable`.

# Automatic lookup

When you have a nested store, you would normally check if the _intermediate_ ID in the URL or in the body actually resolves to an existing record. It's also often important, when checking for store permissions, to access that record.

Imagine that you have this store:

    var ManagersCars = declare( Store, {

      schema: new Schema({
        make     : { type: 'string', trim: 60, required: true },
        model    : { type: 'string', trim: 60, required: true },
      }),

      storeName: 'managersCars',
      publicURL: '/managers/:managerId/cars/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      autoLookup: {
        managerId: 'managers'
      },

      nested: [
        {
          type: 'lookup',
          localField: 'managerId',
          store: 'managers',
        }
      ],
    });
    var managersCars = new ManagersCars();

Note that the store has an extra `autoLookup` property, where:
* the key is the name of the field, in `params`, for which automatic lookup will happen
* the value is the name of the store where the lookup will happen

Note that:

* The lookup is _always_ carried out using the looked up store's ID, which needs to correspond to the value in the URL param or body
* If lookup failes, the store returns a NotFound error
* If lookup is successful, the looked up store's data is available under `request.lookup.managerId`. To get the record, JsonRestStore uses the store's table primitives; so, _none_ of the normal hooks are called. Basically, in `request.lookup.managerId` the record is fetched "as is".

A typical use case is to check, in a PUT for example, that only the logged in manager can change the car record:

    checkPermissions: function f( request, method, cb ){

      // First of all: user MUST be logged in
      if( ! request.session.userId ) return cb( null, false );

      // Get is always allowed
      if( method === 'get' ) return cb( null, true );

      // managerId is in the `autoLookup` list, hence this will work
      if( request.lookup.managerId.id == request.session.userId ) return cb( null, true );

      // Denied in other cases
      return cb( null, false );
    },


# The `position` attribute

When creating a store, you can set the `position` parameter as `true`. For example:

````Javascript
    var Managers= declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', trim: 60 },
      }),

      position: true,

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });
    var managers = new Managers();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;
````

The `position` attribute means that `PUT` and `POST` calls will have to honour positioning based on `options.putBefore` and `options.putDefaultPosition`.

The main use of `position: true` is that when no sorting is requested by the client, the items will be ordered correctly depending on their "natural" positioning.

Positioning will keep into account the store's `paramIds` when applying positioning. This means that if you have a store like this:

````Javascript
    var Managers= declare( Store, {

      schema: new Schema({
        workspaceId: { type: 'id' },
        name       : { type: 'string', trim: 60 },
        surname    : { type: 'string', trim: 60 },
      }),

      position: true,

      storeName: 'managers',
      publicURL: '/workspaces/:workspaceId/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });
    var managers = new Managers();
````

Positioning will have to take into account `workspaceId` when repositioning: if an user in workspace `A` repositions an item, it mustn't affect positioning in workspace `B`. Basically, when doing positioning, `paramIds` define the _domain_ of repositioning (in this case, elements with matching `workspaceId`s will belong to the same domain).

# File uploads

JsonRestStores in itself doesn't manage file uploads. The reason is simple: file uploads are a _very_ protocol-specific feature. For example, you can decide to upload files, along with your form, by using `multipart-formdata` as your `Content-type`, to instruct the browser to encode the information (before sending it to the sever) in a specific way that accommodates multiple file uploads. However, this is a separate issue to the store itself, which will only ever store the file's _name_, rather than the raw data.

Basicaly, all of the features to uplaod files in JsonRestStores are packed in HTTPMixin. This is how you do it:

    var VideoResources = declare( [ Store ], {

      schema: new HotSchema({
        fileName         : { default: '', type: 'string', protected: true, singleField: true, trim: 128, searchable: false },
        description      : { default: '', type: 'string', trim: 1024, searchable: false },
      }),

      uploadFields: {
        fileName: {
          destination: '/home/www/node/deployed/node_modules/wonder-server/public/resources',
        },
      },

      storeName:  'videoResources',

      publicURL: '/videosResources/:id',
      hotExpose: true,

      handlePut: true,
      handlePost: true,
      handleGet: true,

    });
    stores.videoTemplatesResources = new VideoTemplatesResources();

In this store:

* The store has an `uploadFields` attribute, which lists the fields that will represent file paths resulting from the successful upload
* The field is marked as `protected`; remember that the field represents the file's path, and that you don't want users to directly change it.

For this store, HTTPMixin will do the following:

* add a middleware in stores with `uploadFields`, adding the ability to parse `multipart/formdata` input from the client
* save the files in the required location
* set `req.body.fileName` as the file's path, and `req.bodyComputed.fileName` to true.

JsonRestStores will simply see values in `req.body`, blissfully unaware of the work done to parse the requests' input and the work to automatically populate `req.body` with the form values as well as the file paths.

The fact that the fields are protected meand that you are _not_ forced to re-upload files every time you submit the form: if the values are set (thanks to an upload), they will change; if they are not set, they will be left "as is".

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


In order to configure file uploads, you can set three attributes when you declare you store:

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
    },

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

    uploadLimits: {
      fileSize: 50000000 // 50 Mb
    },

### `uploadFields`

This is the heart of the upload abilities of JsonRestStores.

It accepts two parameters:

#### `destination`

This parameter is mandatory, and defines where the files connected to that field will be stored. It can either be a string, or a function with the following signature: `function( req, file, cb )`. It will need to call the callback `cb` with `cb( null, FULL_PATH )`. For example:

    uploadFields: {

      avatarImage: {
        destination: function (req, file, cb) {
          // This can depend on req, or file's attribute
          cb( null, '/tmp/my-uploads');
        }
      }

    },

#### `fileName`

It's a function that will determine the file name. By default, it will be a function that works out the file name from the field name and either the record's ID (for PUT requests, where the ID is known) or a random string (for POST requests, where the ID is not known).

If you don't set it, it will be:

uploadFields: {

      avatarImage: {
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
          return cb( null, file.fieldname + '_' + id );
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



####

# `deleteAfterGetQuery`: automatic deletion of records after retrieval

If your store has the `deleteAfterGetQuery` set to `true`, it will automatically delete any elements fetched with a `getQuery` method (that is, a `GET` run without the final `id`, and therefore fetching elements based on a filter). This is done by forcing `options.delete` to `true` (unless it was otherwise defined) in `makeGetQuery()` .

This is especially useful when a store has, for example, a set of records that need to be retrieved by a user only once (like message queues).

# `hardLimitOnQueries`: limit the number of records

If your store has the `hardLimitOnQueries` set, any `getQuery` method (that is, a `GET` without the final `id`, and therefore fetching elements based on a filter) will never return more than `hardLimitOnQueries` results (unless you are using JsonRestStore's API, and manually set `options.skipHardLimitOnQueries` to `true`).

# Customise search rules

In the previous examples, I explained how marking a field as `searchable` in the schema has the effect of making it searchable in queries:

    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', searchable: true, trim: 60 },
      }),

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });

    var managers = new Managers();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;


If you query the store with `http://localhost:3000/managers/?surname=mobily`, it will only return elements where the `surname` field matches.

## Custom `onlineSearchSchema`

In JsonRestStores you actually define what fields are acceptable as filters with the parameter `onlineSearchSchema`, which is defined exactly as a schema. So, writing this is equivalent to the code just above:

    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', searchable: true, trim: 60 },
      }),

      onlineSearchSchema: new Schema( {
        surname: { type: 'string', trim: 60 },
      }),

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });

    var managers = new Managers();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;

If `onlineSearchSchema` is not defined, JsonRestStores will create one based on your main schema by doing a shallow copy, excluding `paramIds` (which means that, in this case, `id` is not added automatically to `onlineSearchSchema`, which is most likely what you want).

If you define your own `onlineSearchSchema`, you are able to decide exactly how you want to filter the values. For example you could define a different default, or trim value, etc. However, in common applications you can probably live with the auto-generated `onlineSearchSchema`.

## Custom `queryConditions`

You can decide how the elements in `onlineSearchSchema` will be turned into a search with the `queryConditions` parameter.

`queryConditions` is normally automatically generated for you if it's missing. So, not passing it is the same as writing:

    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', searchable: true, trim: 60 },
      }),

      onlineSearchSchema: new Schema( {
        surname: { type: 'string', trim: 60 },
      }),

      queryConditions: {
        type: 'eq',
        args: [ 'surname', '#surname#']
      },

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });

    var managers = new Managers();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;

Basically, `queryConditions` is automatically generated with the `name` field in the database that matches the `name` entry in the query string (that's what `#name#` stands for).

Remember that here:

    queryConditions: {
      type: 'eq',
      args: [ 'surname', '#surname#']
    },

`surname` refers to the database field `surname`, whereas `#surname#` refers to the query string's `surname` element (which is cast thanks to `onlineSearchSchema`.

If you had defined both `name` and `surname` as searchable, `queryConditions` would have been generated as:

    queryConditions: {
        type: 'and',
        args: [
          { type: 'eq', args: [ 'name', '#name#' ] },
          { type: 'eq', args: [ 'surname', '#surname#' ]
        ]
      },

Basically, _both_ `name` and `surname` need to match their respective values in the query string. To know more about the syntax of `queryConditions`, please have a look at [the conditions object in SimpleDbLayer](https://github.com/mercmobily/simpledblayer#the-conditions-object).

You can effectively create _any_ kind of query based on the passed parameter. For exampe, you could create a `searchAll` field like this:

    onlineSearchSchema: new Schema( {
      searchAll: { type: 'string', trim: 60 },
    }),

    queryConditions: {
      type: 'or',
      ifDefined: 'searchAll',
      args: [
        { type: 'startsWith', args: [ 'number', '#searchAll#' ] },
        { type: 'startsWith', args: [ 'firstName', '#searchAll#' ] },
        { type: 'startsWith', args: [ 'lastName', '#searchAll#' ] },
      ]
    },

This example highlights that `onlineSearchSchema` fields don't have to match existing fields in the schema: they can be _anything_, which is then used as a `#field#` value in `queryConditions`. They are basically values that will be used when constructing the actual query in `queryConditions`.

Keep in mind that the syntax of JsonRestStore's `queryConditions` is identical to the syntax of the `conditions` object in SimpleDbLayer, with the following extras:

1) Value resolution

In JsonRestStores, when a value is in the format `#something#`, that `something` will be replaced by the value in the corresponding value in the query string when making queries. _If `something` is not passed in the query string, that section of the query is ignored._.

Also, if the second parameter is a function rather than a string, the query will be based on the value returned by that function. This is especially helpful when making queries using Date:

    queryConditions: {
      type: 'and',
      args: [
        { type: 'ge', args: [ 'expiry', function( a ){ return new Date() }  ] },
        { type: 'eq', args: [ 'status', 'pending' ] },
      ]
    },

Note that the function is passed "a" as a parameter.

2) `ifDefined` to filter out chunks

You can have the attribute `ifDefined` set as a value in `queryConditions`: in this case, that section of the query will only be evaluated if the corresponding value in the query string is defined.

For example, you could define `queryConditions` as:

    queryConditions: {
      type: 'and',
      args: [

        {
          type: 'and', ifDefined: 'surname', args: [
            { type: 'startsWith', args: [ 'surname', '#surname#' ] },
            { type: 'eq', args: [ 'active', true ] },
          ]
        },

        {
          type: 'startsWith', args: [ 'name', '#name#']
        }
      ]
    },

The strings `#surname#` and `#name#` are translated into their corresponding values in the query string. The `ifDefined` means that that whole section of the query will be ignored unless `surname` is passed to the query string. The comparison operators, which were `eq` in the generated `queryConditions`, are now much more useful `startsWith`.

3) `if` to filter out chunks with a function

If `ifDefined` is't quite enough, you can use the more powerful `if`

    queryConditions: {
      { 'if': function( request ) { return !request.isAdmin }, type: 'eq', args: [ 'hidden', false ]},
    }

The condition will only apply if the statement returns a truly value. (It's up to the application to set `request.admin` beforehand). The scope of the function is the store itself.

4) The immensely useful `each` statement

You will often want to break down a string into words, and then use those individual words in your search criteria. This is what `each` is for. This will be a much more powerful implementation of `searchAll`:

    onlineSearchSchema: new Schema( {
      searchAll: { type: 'string', trim: 60 },
      userId: { type: 'id' }
    }),

    queryConditions: {
      type: 'or',
      ifDefined: 'searchAll',
      args: [
        { type: 'startsWith', args: [ 'number', '#searchAll#' ] },
        { type: 'startsWith', args: [ 'firstName', '#searchAll#' ] },
        { type: 'startsWith', args: [ 'lastName', '#searchAll#' ] },
      ]
    },

    var initialQueryConditions = {
      type: 'and',
      args: [

        // First: filter by userId if passed
        { type: 'eq', args: [ 'userId', '#userId#'] },

        // Second: must satisfy _each_ condition based on the breakdown of #searchAll#, space-separated
        { type: 'each', value: 'searchAll', as: 'searchAllEach', linkType: 'and', separator: ' ', args: [
          { type: 'or', args: [
            { type: 'contains', args: [ 'title', '#searchAllEach#' ] },
            { type: 'contains', args: [ 'videosTags.tagName', '#searchAllEach#' ] },
          ]},
        ]},
      ]
    };

Note that it comes with defaults, so that the `each` line could have looked like this:

    { type: 'each', value: 'searchAll', args: [

Since `linkType` defaults to `and`, the separator defaults to a space, and the `as` field defaults to the name of the value with `Each` added at the end.

`queryConditions` is basically a very powerful engine that will generate the queries for you based on what parameters were passed.

## Nested data and queries

Thanks to `queryConditions` you can define any kind of query you like. The good new is that you can also search in _children_ tables that are defined as `nested` in the store definitions.

For example:

    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', searchable: true, trim: 60 },
        surname: { type: 'string', searchable: true, trim: 60 },
      }),

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      onlineSearchSchema: new HotSchema({
        name    : { type: 'string', trim: 60 },
        surname : { type: 'string', trim: 60 },
        carInfo : { type: 'string', trim: 30 },
      }),

      queryConditions: {
        type: 'and',
        args: [

          {
            type: 'startsWith', args: [ 'surname', '#surname#']
          },

          {
            type: 'or',
            ifDefined: 'carInfo',
            args: [
              { type: 'startsWith', args: [ 'managersCars.make', '#carInfo#' ] },
              { type: 'startsWith', args: [ 'managersCars.model','#carInfo#' ] },
            ]
          }
        ]
      },

      nested: [
        {
          type: 'multiple',
          store: 'managersCars',
          join: { managerId: 'id' },
        }
      ],

    });
    var managers = new Managers();

    var ManagersCars = declare( Store, {

      schema: new Schema({
        make     : { type: 'string', trim: 60, searchable: true, required: true },
        model    : { type: 'string', trim: 60, searchable: true, required: true },
      }),

      onlineSearchSchema: new HotSchema({
        make       : { type: 'string', trim: 60 },
        model      : { type: 'string', trim: 60 },
        managerInfo: { type: 'string', trim: 60 }
      }),

      queryConditions: {
        type: 'and',
        args: [

          { type: 'startsWith', args: [ 'make', '#make#'] },

          { type: 'startsWith', args: [ 'model', '#model#'] },

          {
            type: 'or',
            ifDefined: 'managerInfo',
            args: [
              { type: 'startsWith', args: [ 'managers.name', '#managerInfo#' ] },
              { type: 'startsWith', args: [ 'managers.surname','managerInfo#' ] },
            ]
          }
        ]
      },

      storeName: 'managersCars',
      publicURL: '/managers/:managerId/cars/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      nested: [
        {
          type: 'lookup',
          localField: 'managerId',
          store: 'managers',
        }
      ],
    });
    var managersCars = new ManagersCars();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;
    managersCars.protocolListen( 'HTTP', { app: app } );;

You can see how for example in `Managers`, `onlineSearchSchema` has a mixture of fields that match the ones in the schema (`name`, `surname`) that look for a match in the corresponding fields, as well as search-specific fields (like `carInfo`) that end up looking into the nested children.

It's totally up to you how you want organise your searches. For example, you might decide to make a `searchAll` field instead for `Managers`:

    onlineSearchSchema: new HotSchema({
      searchAll : { type: 'string', trim: 60 },
    }),

    queryConditions: {
      type: 'or',
      ifDefined: 'searchAll',
      args: [
        { type: 'startsWith', args: [ 'name', '#searchAll#'] }
        { type: 'startsWith', args: [ 'surname', '#searchAll#'] }
        { type: 'startsWith', args: [ 'managersCars.make', '#searchAll#' ] },
        { type: 'startsWith', args: [ 'managersCars.model','#searchAhh#' ] },
      ]
    },

In this case, the only allowed field in the query string will be `searchAll` which will look for a match anywhere.

# Sorting options and default sort

A client can require data sorting by setting the `sortBy` parameter in the query string. This means that there shouldn't be a `sortBy` element in the `onlineSearchSchema` attribute. JsonRestStores will parse the query string, and make sure that data is fetched in the right order.

In JsonRestStores you can also decide some default fields that will be used for sorting, in case no sorting option is defined in the query string.

## The `sortBy` option

The `sortBy` attribute is in the format `+field1,+field2,-field3` which will instruct JsonRestStores to sort by `field1`, `field2` and `field3` (with `field3` being sorted in reverse).

When you create a store, you can decide which fields are sortable:

For example:

    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', searchable: true, trim: 60 },
        surname: { type: 'string', searchable: true, trim: 60 },
      }),

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      sortableFields: [ 'name', 'surname' ],

      nested: [
        {
          type: 'multiple',
          store: 'managersCars',
          join: { managerId: 'id' },
        }
      ],

    });
    var managers = new Managers();

    var ManagersCars = declare( Store, {

      schema: new Schema({
        make     : { type: 'string', trim: 60, searchable: true, required: true },
        model    : { type: 'string', trim: 60, searchable: true, required: true },
      }),

      storeName: 'managersCars',
      publicURL: '/managers/:managerId/cars/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      sortableFields: [ 'make', 'model', 'managers.name' ],

      nested: [
        {
          type: 'lookup',
          localField: 'managerId',
          store: 'managers',
        }
      ],
    });
    var managersCars = new ManagersCars();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;
    managersCars.protocolListen( 'HTTP', { app: app } );;

In this case, I didn't define `onlineSearchSchema` nor `queryConditions`: the store will get the default ones provided by JsonRestStores.

Note how `sortableFields` is an array of fields that will be taken into consideration. Each element of the array will be a field in the schema itself.

It is interesting how one of the sortable fields is `managers.name`: since `managers` is a nested table, its sub-fields can be used as sorting fields (as long as they are declared as searchable in their store's schema).

## The `defaultSort` option

If the client doesn't provide any sorting options, you can decide a list of default fields that will be applied automatically. This is useful when you want to retrieve, for example, a list of comments and want to make sure that they are returned in chronological order without having to get the client to specify any sorting optinons.

For example:

    var Comments = declare( Store, {

      schema: new Schema({
        subject: { type: 'string', searchable: true, trim: 60 },
        body   : { type: 'string', searchable: true, trim: 4096 },
        posted : { type: 'date',   searchable: true, protected: true, default: function(){ return new Date() } },
      }),

      storeName: 'comments',
      publicURL: '/comments/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,

      defaultSort: {
        posted: -1
      },

    });
    var comments = new Comments();

    JsonRestStores.init();
    comments.protocolListen( 'HTTP', { app: app } );;

This will ensure that comments are always retrieved in reversed order, newest first. Since `sortableFields` is not defined, the default order (by `posted`) is the only possible one for this store.

Note that the field is marked as `protected`. This means that the user won't be able to change it directly: if `body.posted` is set, it will automatically be unset by JsonRestStores (unless `bodyComputed.posted` is `true` -- this is used for example by HTTPMixin to overwrite upload fields, which are normally protected).

# Stores and collections when using SimpleDbLayerMixin

When using SimpleDbLayerMixin (which is the most common case, unless you are [implementing data manipulation functions on your own](#naked-non-database-stores)), a SimpleDbLayer collection will be created using the following attributes passed to the db layer:

  * `idProperty`: the same as `store.idProperty`
  * `schema`: the same as `store.schema`
  * `nested`: the same as `store.nested`
  * `hardLimitOnQueries`: the same as `store.hardLimitOnQueries`
  * `strictSchemaOnFetch`: the same as `store.strictSchemaOnFetch`
  * `extraIndexes`: the extra indexes to be created.

  * `schemaError`: set as `store.UnprocessableEntityError`, which is the same as `e.UnprocessableEntityError` (from the `allhttperrors` module)
  * `fetchChildrenByDefault`: set to true
  * `positionField`: set to `__position` if `store.position` is set to `true`
  * `positionBase`: set as a copy of `store.paramIds`, after cutting out the last item

The collection's name will match `storeName`, unless you pass a `store.collectionName` attribute.

Note that _if a collection with a matching `collectionName` was already defined, then that collection is effectively reused by SimpleDbLayerMixin_. In this case, the following attribute in the JsonRestStore store will be forced to match the SimpleDbLayer's collection's attributes:

  * `idProperty` (actually if the collection's idProperty doesn't match the store's, an error is thrown)
  * `store.schema`
  * `store.nested` (see next section)
  * `store.hardLimitOnQueries`
  * `store.strictSchemaOnFetch`

This allows you to potentially define SimpleDbLayer's layers beforehand, and then use them in JsonRestStores by defining a `collectionName` matching an existing table's name.
If you decide to do so, remember to set `fetchChildrenByDefault` to true, and `schemaError` to `e.UnprocessableEntityError` (where `e` comes from the module `allhttperrors`). You will also need to set your own `positionField` and `positionBase` manually if you want positioning to happen. Generally speaking, it's just easier and better to let JsonRestStores create your SimpleDbLayer collections.

## A note on indexes

Using SimpleDbLayerMixin implies that you are using an indexed collection. SimpleDbLayer's layer have a method called `generateSchemaIndexes( options )` which will generate indexed for the collections based on the schema. These indexes are most likely all you will ever need. If not, please refer to the [Indexing section in SimpleDbLayer](https://github.com/mercmobily/simpledblayer#indexing) to know more about indexing, remembering that you can always access the SimpleDbLayer instance for a table through `store.dbLayer`.

While developing, you should also remember to run:

    store.dbLayer.generateSchemaIndexes( options, function( err ){
    // ...
    });

Alternatively, you can just run one command that will cover all of your collections:

    DbLayer.generateSchemaIndexesAllLayers( options, function( err ){
    // ...
    });

# Automatic schema changes done by SimpleDbLayerMixin

The `searchable` attribute in the schema is really important: in SimpleDbLayer, for example, only `searchable` fields are actually searchable, and indexes are created automatically for them.

When defining a schema in JsonRestStores with SimpleDbLayerMixin mixed in, the following happens automatically:

* Any element in paramIds will be marked as `searchable` in the store's schema. This means that writing:

````Javascript
    var Managers= declare( Store, {

      schema: new Schema({
        workspaceId: { type: 'id' },
        name       : { type: 'string', trim: 60 },
        surname    : { type: 'string', trim: 60 },
      }),

      position: true,

      storeName: 'managers',
      publicURL: '/workspaces/:workspaceId/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });
    var managers = new Managers();
````

Is the same as writing:

````Javascript
    var Managers= declare( Store, {

      schema: new Schema({
        id         : { type: 'id', searchable: true },
        workspaceId: { type: 'id', searchable: true },
        name       : { type: 'string', trim: 60 },
        surname    : { type: 'string', trim: 60 },
      }),

      position: true,

      storeName: 'managers',
      publicURL: '/workspaces/:workspaceId/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });
    var managers = new Managers();
````

Note that `searchable` is set both for `id` and for `workspaceId` (which are the store's `paramIds`, as they are defined in `publicURL`).

* Any database field mentioned _anywhere_ in `queryConditions` will also be made searchable in the main schema. This means that writing:

````Javascript
    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', trim: 60 }, // Note: surname is NOT searchable
      }),

      onlineSearchSchema: new Schema( {
        surnameSearch: { type: 'string', trim: 60 },
      }),

      queryConditions: {
        type: 'startsWith',
        args: [ 'surname', '#surnameSearch#']
      },

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });

    var managers = new Managers();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;
````

Is the same as writing:

````Javascript
    var Managers = declare( Store, {

      schema: new Schema({
        name   : { type: 'string', trim: 60 },
        surname: { type: 'string', searchable: true, trim: 60 }, // Note: surname IS searchable
      }),

      onlineSearchSchema: new Schema( {
        surnameSearch: { type: 'string', trim: 60 },
      }),

      queryConditions: {
        type: 'startsWith',
        args: [ 'surname', '#surnameSearch#']
      },

      storeName: 'managers',
      publicURL: '/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });

    var managers = new Managers();

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );;
````

This is accomplished by SimpleDbLayerMixin by actually going through the whole `queryConditions` and checking that every database field mentioned in it is made searchable in the main schema.

# Inheriting a store from another one (advanced)

At this point it's clear that stores are defined as constructor classes, which are then used -- only once -- to create a store variable. For example the constructor `Managers()` is used to create the `managers` store with `managers = new Managers()`.

This allows you to define a base store, and derive stores off that base store. For example:

    // The base WorkspacesUsersBase constructor
    // Note that the collectionName is defined to something different to
    // storeName

    var WorkspacesUsersBase = declare( Store, {

      schema: new HotSchema({
        id         : { type: 'id', searchable: true },
        userId     : { type: 'id', searchable: true },
        workspaceId: { type: 'id', searchable: true },
      }),

      storeName: 'workspacesUsersBase',
      collectionName: 'workspacesUsers',

      idProperty: 'id',

      // NOTE: no paramIds nor publicURL is defined.
    });
    stores.workspacesUsersBase = new WorkspacesUsersBase();

    // The specialised WorkspacesUsers constructor, which
    // define an onlineSearchSchema and publicURL

    var WorkspacesUsers = declare( WorkspacesUsersBase, {

      storeName:  'workspacesUsers',
      collectionName: 'workspacesUsers',

      publicURL: '/workspaces/:workspaceId/users/:id',

      handleGetQuery: true,

    });
    stores.workspacesUsers = new WorkspacesUsers();

    // The specialised UsersWorkspaces constructor, which
    // define an onlineSearchSchema and publicURL

    var UsersWorkspaces = declare( WorkspacesUsersBase, {

      storeName:  'usersWorkspaces',
      collectionName: 'workspacesUsers',

      publicURL: '/users/:userId/workspaces/:id',

      handleGetQuery: true,

    });
    stores.usersWorkspaces = new UsersWorkspaces();

In this example, `WorkspacesUsersBase` is used as a starting point, defining `schema` and `idProperty`. Note that all `id` fields are defined in the schema manually (since there was no `paramIds` nor `publicURL` defined to do it automagically). `WorkspacesUsersBase` also defines `workspacesUsers` as `collectionName` (otherwise, `collectionName` would have been `workspacesUsersBase`). Two specialised stores are then inherited from `WorkspacesUsersBase`: `WorkspacesUsers` and `UsersWorkspaces`. They both enable `handleGetQuery` and are assigned different URLs, and therefore have different paramIds; however, they both use the same database collection called `workspacesUsers`.

When you inherit a store using SimpleDbLayerMixin, you need to remember that **collections are always recycled if they were already defined by a previous store**.

In this particular case, when you run `stores.workspacesUsersBase = new WorkspacesUsersBase();` you are actually creating a SimpleDbLayer collection called `workspacesUsers`. Since derived constructors `WorkspacesUsers` and `UsersWorkspaces` define `workspacesUsers` as their collection, _the collection will be recycled since it already exists_.
This means that the following attributes of the store will be reused (and redefining them in the derived store will have no effect):

* `idProperty` (from the store's `idProperty` attribute)
* `schema` (from the store's `schema` attribute)
* `hardLimitOnQueries` (from the store's `hardLimitOnQueries` attribute)
* `strictSchemaOnFetch` (from the store's `strictSchemaOnFetch` attribute)
* `indexBase` (from the store's `indexBase` attribute)

As a consequence, a derived store cannot redefine `idProperty`, `schema`, `hardLimitOnQueries`, `strictSchemaOnFetch`, `indexBase` (since they are used to create the dblayer instances when the base JsonRest store is created).

This also means that position grouping will depend on the _base_ constructor's `paramIds`, since the collection's `positionBase` will depend _only_ on the base class' `paramIds`. (Note: `positionBase` in a collection defines which fields are used to 'group' ordering, see [how repositioning works in SimpleDbLayer](https://github.com/mercmobily/simpledblayer#nested-record-positioning)). This will only affect you if you are creating derived stores with positioning.

# Self-documetation

JsonRestStores offers the ablity to write estensive documentation about the stores created. The key to this feature is a documentation object that gets generated using the store's attributes as information source.

## Documenting

Documenting a store is very straightforward: you simply need to add extra descriptive fields to the store itself; the text will be formatted as markdown.

Here is an example of a fully documented store:


    var Managers= declare( Store, {

      'main-doc':`
        This is the main `Managers` store, storing information about all of the managers.
      `,

      'schema-doc':`
        The schema simply contains the name and the surname of the managers. Each record is
        trimmed to 60 characters.
      `,
      schema: new Schema({
        id         : { type: 'id', searchable: true },
        workspaceId: { type: 'id', searchable: true },
        name       : { type: 'string', trim: 60, doc: "The manager's name" },
        surname    : { type: 'string', trim: 60, doc: "The manager's surname" },
      }),
      'schema-extras-doc': {
        ranking: { type: 'number', doc: "Only in GET: Automatically calculated ranking" },
      },

      'item-doc':`
        An item returned looks like this:
            {
               id: ObjectId( '827438242938748234'),
               workspaceId: ObjectId('37423974234729748234'),
               name: 'Tony',
               surname: 'Mobily',
               ranking: 1865
            }
      `,

      `permissions-doc`:{
        'put': `
          The user needs to be logged in. Also, the manager's name cannot be "Tony".
        `,
        'post': `
          The user needs to be logged in. Also, the manager's name cannot be "Tony".
        `,
      },
      checkPermissions: function( request, method, cb ){
        if( ! request.session || ! request.session.userId ) return cb( null, false, "User needs to be logged in");

        if( method == 'put' || method == 'post' && request.body.name == 'Tony' ){
          return cb( null, false, "Managers called 'Tony' are not allowed" );
        }

       return cb( null, true );

      },

      prepareBeforeSend: function( request, method, doc, cb ){
        doc.ranking = Math.foor( Math.random() * 10000 );

        cb( null, doc );
      },

      position: true,

      storeName: 'managers',
      publicURL: '/workspaces/:workspaceId/managers/:id',

      handlePut: true,
      handlePost: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });
    var managers = new Managers();

Note that:

* This is an especially simple store
* The contents of the doc fields is always in Markdown format
* The description fields have a newline and then an indentation. This will keep your code neat. Remember that the initial newline and indentation, as well as any indentation of matching length, will be deleted from the documentation.
* If you have `{{something}}` in fields ending with `-doc` (`main-doc`, `permissions-doc`, etc.), then  `{{something}}` will be changed with the contents of the firls matching property in the object's prototype. This means that you can use `this.inherited()` in your `permissions-doc.put` description, and write "This contraint needs to be satisfied: {{permssions-doc.put}}. Then, also this is checked...".

Here is a detailed explanation of the documentation fields.

### error-format-doc (Markdown text)

The error as it's returned by JsonRestStores. YOu should rewrite this if you change your store's `formatErrorResponse()` function.

### `main-doc` (Markdown text)

The main documentation for the store: what it does, what it's for, how it fits in the API

### `schema-extras-doc` (object, schema format)

This is useful to add extra fields to the schema, as if they were defined in the schema directly.

### `schema-doc` (Markdown text)

Describes the schema in general: what data it contains, why specific fields, the rational behind it, etc.

### `item-doc` (Markdown text)

What an return item will look like. Include computer fields, and explain things

### The `doc` field in schema fields (Markdown text)

Describes the purpose of each field.

### permissions-doc (object)

An object where keys are `get`, `getQuery`, `put`, `post`, `delete` and their contents is Markdown text.
Each one describes how permissions work for the specified method.

## Gathering documentation information

The section above explains how to add a stores' documentation to the store's structure itself. How can you then generate comprehensive documentation?

The constructor function `docData = Store.document( store )` will do the trick, and will return _full_ documentation for the store `store`.

You can also apply the function in bulk and run:

    allDocsData = JsonRestStores.makeDocsData( JsonRestStores.getAllStores(), extraDocStores, ... );

Which will run `Store.document()` on *every* store in the registry, as well as extra user-defined pseudo-stores.

The variable `allDocsData` will contain the documentation information of all of the stores.

This information includes the documentation information you defined in the store itself (formatted as Markdown), as well as extra information gathered from the store itself.

Here is the full set of information:

### `main-doc` (source: the store's `main-doc` string)

The store's main documentation. Here you would put a general description of what the store is for, specific features you need to be aware of, etc.

### `storeName` (source: the store's `storeName` string)

The store's name

### `schema-doc` (source: the store's `schema-doc` string)

An general explanation of what the schema contains.

### `schema` and `schemaExplanations` (source: the store's `schema` hash)

* `schema` is a copy of the `schema` object, where in each object the `doc` part is taken out.
* `schemaExplanations` is a hash with the same keys as `schema`, where each value is the respective `doc` value taken out of the original object

### `backEnd` (source: the store's `layer` object )

If set, it means that the store uses a database backend, for which it will return:

* `collectionName` -- the name of the database collection
* `hardLimitOnQueries` -- the hard limit on `getQuery` queries

### `parents` (source: the store's prototype chain)

An array with the list of `storeName`s the store is derived from. This assumes that every prototype has a `storeName` set.

### `strictSchemaOnFetch` (source: the store's `strictSchemaOnFetch` flag)

Set to `true` if the store will enforce schema-checking when fetching records, and `false` otherwise.

### `singleFields` (source: the store's `_singleFields` hash)

A hash with the list of "single fields" for the store, where each key is an entry in the store's schema.

### `nested` (source: the store's `nested` array)

An array of sentences, where each one describes how records in a nested store are fetched.

### `position` (source: the store's `position` flag)

Set to `true` if the store manages positioning, and `false` otherwise.

### `item-doc` (source: the store's `item-doc` string)

What a returned item looks like, after a get/getQuery or after a put/post/delete

### `error-format-doc` (source: the store's `error-format-doc` string)

Is a string representing what an error object looks like. You will normally change it in a store if yo uredefine the `formatErrorResponse()` method, which by default returns:

    "{ message: 'The message', errors: [ { field1: 'message1',  field2: 'message2' } ] } (errors is optional)"

Note that this is a string.

### `permissions-doc` (source: the store's `permissions-doc` hash)

A hash where each key can be 'getQuery', 'get', 'put', 'post', 'delete'. Each key has a text explanation of what the store's permissions are for that specific method.

### `methods`

A hash where each key is a supported method (for example 'getQuery', 'get', 'put', 'post', 'delete' ).

Each method object has the following attributes:

* `OKresponses`. An array of objects, where each item can be:
    { name: 'OK', status: 200, data: '[ item1, item2 ]', doc: `where item1, item2 are the full items` }

* `errorResponses`. An array of objects, where rach item will look like this:

    { name: 'NotImplementedError', status: 501, data: s['error-format-doc'], 'Content-type': 'text/html', doc: "The method requested isn't implemented" },

* `url`. The URL for that method. Source: the `getFullPublicURL()` method

* `permissions-doc`. A string describing the permissions for that method. Source: The relevant key of the store's `permissions5-doc` hash.

* `incomingHeaders` and `outgoingHeaders` (array of objects). The headers: the incoming ones will affect how the method works, and the outgoing will provide extra information. For example PUT and POST methods will set the `Location` header. En entry could be:
   { 'Location': "Since this store implements `get`, this header will be set as the URL where the item can be retrieved" }`

However, each method will then return a different set of pieces of information, depending on what they do.
For example:

#### `getQuery`

* `onlineSearchSchema` and `onlineSearchSchemaExplanations`: they are created exacly like `schema`. However, it uses the store's `onlineSearchSchema` hash as starting point.
* `search-doc`. An explanation on how the `onlineSearchSchema` works. Source: `store.getQuery['search-doc']`
* `defaultSort`. The fields the store will use as default sort.  Source: the store's `defaultSort` attribute
* `deleteAfterFetchRecords`. True if the store's `deleteAfterGetQuery` attribute it true, false otherwise.
* `sortableFields`. The list of fields the store can be sorted by

#### `get`

* `onlySingleFields`: set to `true` if the store only allows `get` for single fields

#### `put`

* `onlySingleFields`: set to `true` if the store only allows `put` for single fields
* `echo`: set to `true` if the store's `echoAfterPut` attribute is true, false otherwise.

#### `post`

* `echo`: set to `true` if the store's `echoAfterPost` attribute is true, false otherwise.

#### `delete`

* `echo`: set to `true` if the store's `echoAfterDelete` attribute is true, false otherwise.

### Final changes (source: the object's `changeDoc()` method)

The final changes to the documentation object are applied by running the `changeDoc(s)` method, which is called in a "constructor-like" fashion: starting from the first prototype in the chain to the last. This ensures that _all_ of the changes are applied throughout the prototype chain of the object.

This method can be defined when you need to change the default settings of a store.

For example `HTTPMixin` in JsonRestStores does this:

    changeDoc: function( store, rn ){
      var headers;

      // ...
      if( rn.put ){
        rn.methods.put.incomingHeaders =  rn.methods.put.incomingHeaders || [];
        var headers = rn.methods.put.incomingHeaders;

        headers.push( { name: 'If-match', doc: "If set to `*`, sets the `overwrite` option to `true`: the `put` will only ever overwrite an existing record. It will refuse to create a ne record." } )

        headers.push( { name: 'If-none-match', doc: "If set to `*`, sets the `overwrite` option to `false`: the `put` will only ever create a new record. It will refuse to overwrite an existing record."})
      // ...
    }

It basically adds incoming header options to the PUT method.


## Actually rendering documentation

Once you have a full data structure containing all of this info, creating an actual document _can_ be a little daunting. Fortunately, EJS comes to the rescue.

You can use EJS to write sample documentation, for example:

    // Minimal number of modules to get JsonRestStores going
    var dummy
      , hotplate = require('hotplate')
      , JsonRestStores = require('jsonreststores')
      , fs = require('fs')
      , ejs = require('ejs')
    ;

    function formatObject( o ) {
      var r = '', once = false;
      Object.keys( o ).forEach( function( k ){
        r = r + k + ': ';
        r = r + JSON.stringify( o[ k ] ) + ', ';
        once = true;
      })
      if( once ) r = r.substr( 0, r.length - 2 );

      return  r;
    }


    // ...
    // Run the code in your app that will declare stores
    // ...

    // Prepare the template
    var data = JsonRestStores.makeDocsData( JsonRestStores.getAllStores() );
    var str = fs.readFileSync( 'store.ejs');
    var template = ejs.compile(str.toString(), { localsName: 's', rmWhitespace: false } );

    // Make up the documentation
    var r = '';
    Object.keys( data ).forEach( function( sk ){
      console.log("\n\nDocumenting: " + sk + "\n" );

      // Prepare the data object
      var s = data[ sk ];
      s.obj = formatObject; // Used to format the schema entries

      console.log("Which has keys: " + Object.keys( s ) + " and methods: " + Object.keys( s.methods )) ;

      // Add the new bit of documentation
      r = r + template( s );

    });
    fs.writeFileSync("gen-docs.html", r );

You can also use the sample `store.ejs` file as a starting point for your stores' documentation.
Note that you will need to _actually_ run the code to define your stores before using `JsonRestStores.makeDocsData`.

# Data preparation hooks

With JsonRestStores, you are able to redefine specific methods to enrich the functionality of your stores. There are two classes of methods:

* Methods to manipulate data fetched from external sources. They are:

````Javascript
    prepareBody: function( request, method, body, cb ){ cb( null, preparedBody ); }
    extrapolateDoc: function( request, method, doc, cb ){ cb( null, extrapolatedDoc ); }
    prepareBeforeSend: function( request, method, doc, cb ){ cb( null, preparedDoc ); }
````

* Methods to hook code at specific stages in the request's lifecycle. They are:

````Javascript
    afterValidate: function( request, method, p, cb ){ cb( null ); }
    afterCheckPermissions: function( request, method, p, cb ){ cb( null ); }
    afterDbOperation: function( request, method, p, cb ){ cb( null ); }
    afterEverything: function( request, method, p, cb ) { cb( null ); }
````
## Data manipulation methods

These hooks share the same signature (the third parameter is always the data to be manipulated), and must call the callback passing an object containing computed data; to minimise side effects, it's best to base the new data on a new object; to facilitate the shallow copying process, JsonRestStores provides the `_co()` method (which stands for _C_opy _O_bject). For example, to implement `prepareBody()` you would write:

    prepareBody: function( request, method, body, cb ){

      // Make a copy of body into newBody
      var newBody = this._co( body );

      // Some elaboration.
      newBody.headerName = newBody.headerName + "." + newBody.name;

      // Forces `createdBy` to the value passed to the session
      if( request.remote ) newBody.createdBy = request.session.userId;

      cb( null, newBody );
    },

In some cases, you will want to run the _original_ `prepareBody()` method, and then do more processing. In this case, you would write:

    prepareBody: function f( request, method, body, cb ){

      this.inheritedAsync( f, arguments, function( err, newBody ){

        // Make a copy of body into newBody
        var newBodyAgain = this._co( newBody );

        // Some elaboration.
        newBodyAgain.headerName = newBodyAgain.headerName + "." + newBodyAgain.name;

        // Forces `createdBy` to the value passed to the session
        if( request.remote ) newBodyAgain.createdBy = request.session.userId;

        cb( null, newBodyAgain );

      });

    },

Here, the original `preparebody()` is run through `this.inheritedAsync()`, and processing is done on its resulting `newBody`.

For more information about `inheritedAsync()`, have a look at [SimpleDeclare's documentation on calling asynchronous parent methods](https://github.com/mercmobily/simpleDeclare#calling-the-super-function-with-node-style-callback).

Throughout the request's life cycle, `request.data` will be enriched by each data preparation hook. This will allow any hook to access the processed data

NOTE: `request.putNew` is set to `true` for PUT requests that are creating a new record. `request.putExisting` is set to `true` for PUT requests that are overwriting an existing record. This is set after the hook `afterValidate()`.

###  `prepareBody( request, method, body, cb )`

`prepareBody()` is called with the data passed from the client _as is_ (no casting, nor anything). Any manipolation done by `prepareBody()` will need to satisfy the schema, or validation will actually fail. This hook is useful if you want to force some fields to specific values, maybe depending on a session variable for the specific user. For example, when a record is created, you will have `creatorId` in the schema, but you won't want users to be able to specify any ID there. So, you can simply assign body.creatorId in the `prepareBody()` hook.

The parameters are:

 * `request`. The `request` object for this REST call.
 * `method`. It can be `post` or `put`.
 * `body`. The request's body.
 * `cb( err, body ) `. The callback, which will need to be passed a `body` object as its second parameter.

### `extrapolateDoc( request, method, doc, cb )`

You can use this method to manipulate your data every time it's fetched from the data source. Fetching can happen for a number of reasons:

* in `post`: after a new item is written, it's then fetched and then sent it to the client after `extrapolateDoc()`
* in `put` (creating new records): after a new item is written, it's then fetched and then sent it to the client after `extrapolateDoc()`
* in `put` (overwriting an existing record): `extrapolateDoc()` is actually called twice: the first time after the item is fetched, and then again when it's re-fetched after writing it to the database
* in `get`: when an item is fetched
* in `getQuery`: when several items are fetched
* in `delete`: when an item is about to be deleted, it's fetched first

Basically, think of `extrapolateDoc` as a hook to manipulate whatever is in the database in order to add fields or dynamic information as needed.

The parameters are:

 * `request`. The `request` object for this REST call.
 * `method`. It can be `post`, `put`, `get`, `getQuery`, `delete`
 * `doc`. The record after fetching
 * `cb( err, doc ) `. The callback, which will need to be passed a `doc` object as its second parameter.


Note that if the method is being called on nested data, `request.nested` will be set to `true`.

### `prepareBeforeSend( request, method, doc, cb )`

You can use this method to manipulate your data just before it's sent over to the client requesting it.

Think of `extrapolateDoc` as a hook to make very-last-nanosecond changes to the result object before it's sent over to the client.

The difference from `extrapolateDoc()` is conceptual: `extrapolateDoc()` extracts the right information from the data source, whereas `prepareBeforeSend()` makes very-last-nanosecond changes to keep the client happy.

The parameters are:

 * `request`. The `request` object for this REST call.
 * `method`. It can be `post`, `put`, `get`, `getQuery`, `delete`
 * `doc`. The entry after fetching
 * `cb( err, doc ) `. The callback, which will need to be passed a `doc` object as its second parameter.

Note that if the method is being called on nested data, `request.nested` will be set to `true`. In this case (and only in this case), if the result of `prepareBeforeSend()` is an empty object (where `Object.keys()` is `0`), then the record is _deleted_ from `_children`.


## Stage methods

Stage methods allow you to hook yourself to several stages of the request processing stages. You can manipulate the `request` object, or can simply make things happen.

They all share the same signature: (`request, method, cb`). Each method has access to the `request` object, which has the `request.data` filled in with the data as it's fetched from the database and manipulated.

To really use the stage hooks (and to extend JsonRestStores in general), it's important to know exactly [what happens in each request](#what-happens-exactly-in-each-request). Note how values are assigned to `request.data` as the request progresses. In general, the record fetched from the database will be `fullDoc`; once it's extrapolated, it's `doc`.

### `afterValidate()`

This method is called once validation is completed.

 * `request`. The `request` object for this REST call.
 * `method`. It can be `post`, `put` or `getQuery`.
 * `cb( err ) `. The callback

### `afterCheckPermissions()`

This method is called once permission checks have passed.

 * `request`. The `request` object for this REST call.
 * `method`. It can be `post`, `put`, `get`, `getQuery`, `delete`.
 * `cb( err ) `. The callback.

### `afterDbOperation()`

This method is called once data is read from, or written to, the data source for that request.

 * `request`. The `request` object for this REST call.
 * `method`. It can be `post`, `put`, `get`, `getQuery`, `delete`.
 * `cb( err ) `. The callback.

### `afterEverything()`

This method is the very last one called before sending the response out.

 * `request`. The `request` object for this REST call.
 * `method`. It can be `post`, `put`, `get`, `getQuery`, `delete`.
 * `cb( err ) `. The callback.

# How stores work behind the scenes: a walk-through

Here is a walk-through on how stores actually work, and how requests are fulfilled. Note that this refers very specifically to stores mixing in with HTTPMixin and with SimpleDbLayerMixin.

## Store definition

Assume you define a store like this:

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

    JsonRestStores.init();
    managers.protocolListen( 'HTTP', { app: app } );

# Artificial delays

When testing the application locally, everything is fast and zippy. However, stores don't tend to behave like that in real life. If your application implements things like drag&drop, form saving, etc, you often want to see how it behaves in "real life" -- in a situation where responses can take anything between 1 and 8 seconds.

In order for force JsonRestStores to add an artificial delay to _every_ online request (it won't apply to API), just assign a value to JsonRestStores.artificialDelay, like this:

    var JsonRestStores = require('jsonreststores');
    JsonRestStores.artificialDelay = 8000;

This will apply to _every_ online request, which will be delayed by 8 seconds.

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

If you have `chainErrors: nonhttp` in your class definition, JsonRestStores will only call `next( err ) ` for non-HTTP errors --  any other problem (like your MongoDB server going down) will be handled by the next Express error management middleware. Use this if you want the server to respond directly in case of an HTTP problem (again using `self.formatErrorResponse()` to send a response to the client), but then you want to manage other problems (for example a MongoDB problem) with Express.

### `self.formatErrorResponse()`

In those cases where you decide to send a response to the client directly (with `chainErrors` being `none` or `nonhttp`), the server will send a response to the client directly. The body of the response will depend on what you want to send back.

The stock `self.formatErrorResponse()` method will simply return a Json representation of the error message and, if present, the `errors` array within the error.

### `self.logError()`

Whenever an error happens, JsonRestStore will run `self.logError()`. This happens regardless of what `self.chainErrors` contains (that is, whether the error is chained up to Express or it's managed internally). Note that there is no `callback` parameter to this method: since it's only a logging method, if it fails, it fails.

# How requests are managed in JsonRestStores

In JsonRestStores, there are five different types of requests:

* `get`
* `getQuery`
* `put`
* `post`
* `delete`

The module is in itself decoupled from the transport protocol. Each request is in itself an object that can have the following attributes:

* `remote`: Set to `true` for requests coming from the outside, and `false` for requests triggered internally (e.g. via API).
* `protocol`: defaults to HTTP. It will define how data is sent and received.
* `params`: the URL params -- For example, a request like this: `PUT /managers/10/cars/20` will have `params` set as `{ managerId: 10, id: 20 }`
* `body`: the data sent by the users
* `bodyComputed`: an associative array; for each key set to `true`, the `protected` attribute in the schema won't apply (since it's assumed to have been computed automatically -- this mechanism is used by file uploads)
* `session`: the session variable
* `options`: options that will determine how the request will be handled. Each method will expect different options.

## The `options` object

This is a very important object, and its content will determine what the methods will actually do.

### `get` (implemented in `_makeget()`)
  * `field`. If it's set, then it will only return that specific field (anything else will e stripped out of the record). All of the hooks will be called as per normal.

### `getQuery` (implemented in `_makeGetQuery()`)
  * `conditionsHash`. An hash object containing the filter criteria, which will have to match `onlineSearchSchema`.
  * `ranges`. It can have `skip` and `count`.
  * `sort`. An hash that defines how to sort the query. For example `{ model: -1, maker: 1 }`. Note that each key needs to be listed in the `sortableFields` element of the store.
  * `skipHardLimitOnQueries`. If set to `true`, the attribute `hardLimitOnQueries` will be ignored when making `getQuery` calls.
  * `delete`. If set to `true`, each record will be deleted after retrieval. Note that if the store's `self.deleteAfterGetQuery` is set to `true`, then `delete` will automatically be set to true for each request.

### `put` (implemented in `_makePut()`)
  * `putBefore`. If set, and if the store supports positioning, the entry will be placed before the entry with id `putBefore`.
  * `putDefaultPosition`. If set, and if the store supports positioning, this option will instruct JsonRestStores where to place the entry: `start` or `end` (only used when `putBefore` isn't set)
  * `overwrite`. If set to `true`, the `put` will only be successful if the record is an existing one. If set to `false`, the `put` will only be successful if the record didn't exist. If not set, the `put` will work either way.
  * `field`. If it's set, then it will only set that specific field (anything else will e stripped out of the record). All of the hooks will be called as per normal.

### `post` (implemented in `_makePost()`)
  * `putBefore`. Same as the handler `_makePut`
  * `putDefaultPosition`. Same as the handler `_makePut`

### `delete` (implemented in `_makeDelete()`)

This method doesn't take any options.

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

## Listening to HTTP requests

The last line is the one that makes the store "active": `managers.protocolListen( 'HTTP', { app: app } )` will actually run `managers.protocolListenHTTP()`, which is defined thanks to `HTTPMixin`.
`protocolListenHTTP()` will define the appropriate routes using Express' `app` (passed to it as a parameter).
The code in HTTPMixin looks like this:

    // Make entries in "app", so that the application
    // will give the right responses
    app.get(      url + id, this._getRequestHandler( 'Get' ) );
    app.get(      url,      this._getRequestHandler( 'GetQuery') );
    app.post(     url,      this._getRequestHandler( 'Post') );
    app.put(      url + id, this._getRequestHandler( 'Put') );
    app.delete(   url + id, this._getRequestHandler( 'Delete') );

So, the following routes are defined:

    GET /managers/:id -- returns a specific manager. Handler: `store._makeGet()`
    GET /managers/ -- returns a collection of elements; you can filter by surname, which is searchable. Handler: `store._makeGetQuery()`
    PUT /managers/:id -- writes over an existing manager object. Handler: `store._makePut()`
    POST /managers/ -- creates a new manager object. Handler: `store._makePost()`
    DELETE /managers/:id -- deletes a manager. Handler: `store._makeDelete()`

Plus the `singleField` routes:

    PUT /managers/:id/field1 -- writes over an existing manager object, ONLY field1
    GET /managers/:id/field1 -- returns `field1` for a specific manager

The method `this._getRequestHandler()`, also defined in HTTPMixin, will be responsible of creating a plain Javascript object called `request`. This object needs to be compatible with what was explained earlier in terms of parameters; HTTPMixin will create it as follows:

* `remote`: Set to `true`.
* `protocol`: set to HTTP.
* `params`: set to the URL parameters. For example, a request like this: `PUT /managers/10/cars/20` will have `params` set as `{ managerId: 10, id: 20 }`
* `body`: set to the request's `body`.
* `session`: set to the request's session.
* `_req` and `_res`: set to the request's `req` and `res` parameters -- this is specific to HTTPMixin.
* `options`: set based on the request's query string and headers, see the next section for more details

After defining this object, `this._getRequestHandler()` will finally be ready to call one of the following methods (depending on the method):

 * `_makeGet( request, next )` (implements GET for one single document)
 * `_makeGetQuery( request, next )` (implements GET for a collection, no ID passed)
 * `_makePut( request, next )` (implements PUT for a collection)
 * `_makePost( request, next )` (implements POST for a collection)
 * `_makeDelete( request, next )` (implements DELETE for a collection)

These methods are the heart of JsonRestStores: they will handle the request by calling `implementFetchOne()`, `implementInsert()`, `implementUpdate()`, `implementDelete()`, `implementQuery()` and `implementReposition()` (conveniently provided in this case by SimpleDbLayerMixin).

### How HTTPMixin creates the `options` object

Protocol mixins (in this case, HTTPMixin) have the task of accepting the request, and make sure that the `options` object passed to the request handler is adequately filled depending on the request itself.

Specifically:

#### `_makePut`
  * `putBefore`. From header `x-put-before`
  * `putDefaultPosition`. From header `x-put-default-position`
  * `overwrite`. If the header `if-match` is set to `*`, it's set to true. If the header `if-none-match` is set to `*`, is set to false.

#### `_makePost`
  * `putBefore`. Same as the handler `_makePut`
  * `putDefaultPosition`. Same as the handler `_makePut`

#### `_makeGetQuery`:
  * `conditions`. Worked out from the query string.
  * `ranges`. Worked out from the `range` header; if the header is `3-10`, then `ranges` will be assigned `skip: 3, limit: 8 }` (it will skip to the third element, and will fetch 8 elements at the most).
  * `sort`. Worked out from the `sortBy` element in the query string; if it is for example `?sortBy=-model,+maker`, `options.sort` will be `{ model: -1, maker: 1 }`.

Please note that you can easily overload the specific methods in HTTPMixin if you want store parameters to be taken from the store differently.

## How `HTTPMixin` sends data via HTTP

HTTPMixin implements `protocolSendHTTP()`, as described earlier in this guide.
If the response is empty, it simply uses express' `res.send()`. If there is data, the data is expected to be JSON. So, it uses `res.json(...)` (which will set the corresponding `Content-type` header to `application/json`).

Also:

* The `post` and `put` methods will set the `Location` header, IF `handleGet` is set to `true` for the store
* `getQuery` will set the `Content-Range` headers, e.g. `items 3-10/100`, which will tell the client what was actually fetched in terms of range, and what the total count is.

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

# Naked, non-database stores

JsonRestStores is powerful thanks to `SimpleDbLayerMixin`, which allows you to create database-backed stores in seconds. However, there are times when you want to write a store from scratch without mixing in `SimpleDbLayerMixin`. You might want to create a store that returns virtual values (like the number of online users), or a store that returns a dataset that is fetched from a different backed (a text file, for example) etc.

To do that, you will need to write a store that implements the `implement***` methods, which are:

 * `implementFetchOne( request, cb )`. Required for methods `put`, `get`, `delete`.
 * `implementInsert( request, forceId, cb )`. Required for methods `post` and `put` (new records)
 * `implementUpdate( request, deleteUnsetFields, cb )`. Required for method `put` (existing records)
 * `implementDelete( request, cb )`. Required for method `delete`.
 * `implementQuery( request, next )`. Required for methods `getQuery`.
 * `implementReposition( doc, where, beforeId, cb )`. Required for methods `post` and `put`.

Looking it from a different perspective, here are the `implement***` methods you will need to implement for each method to work properly:

 * `get`: `implementFetchOne()`.
 * `getQuery`: `implementQuery()`
 * `put`: `implementFetchOne()`, `implementInsert()`, `implementUpdate()`, `implementReposition()`
 * `post`: `implementInsert()`, `implementReposition()`
 * `delete`: `implementDelete()`

When developing these methods, it's important to make sure that they function exactly as expected.

## `implementFetchOne( request, cb )`

This method is used to fetch a single record from the data source. The attributes taken into consideration in `request` are:

* `request.remote`.
* `request.params`. Sets the filter to search for the record to be fetched. For local request, it's acceptable to just match the key in `request.params` matching `self.idProperty`. For remote requests, it's best to filter data so that every key in `request.params` matches the equivalent key in the record.

The callback `cb()` must be called with the fetched element as its second parameter, or `null` if a match wasn't found.

## `implementInsert( request, forceId, cb )`

This method is used to add a single record to the data source. No attribute is taken into consideration in `request`.

If `forceId` is set, then a shallow copy of the record should be made (with `this._co()`) and the object's `idProperty` key should be forced to be `forceId`.

The callback `cb()` must be called with the record once written on the data source.

## `implementUpdate( request, deleteUnsetFields, cb )`.

This method is used to update a single record in the data source. The attributes taken into consideration in `request` are:

* `request.remote`.
* `request.params`. Sets the filter to search for the record to be updated. For local request, it's acceptable to just match the key in `request.params` matching `self.idProperty`. For remote requests, it's best to filter data so that every key in `request.params` matches the equivalent key in the record.
* `request.body`. The fields to be updated in the data source.

If `deleteUnsetFields` is set to `true`, then all fields that are not set in `request.body` must be deleted from the matched record in the data source.

The callback `cb()` must be called with the updated element as its second parameter, or `null` if a match wasn't found.

## `implementDelete( request, cb )`

This method is used to delete a single record from the data source. The attributes taken into consideration in `request` are:

* `request.remote`.
* `request.params`. Sets the filter to search for the record to be deleted. For local request, it's acceptable to just match the key in `request.params` matching `self.idProperty`. For remote requests, it's best to filter data so that every key in `request.params` matches the equivalent key in the record.

The callback `cb()` must be called with the fetched element as its second parameter, or `null` if a match wasn't found.

## `implementQuery( request, next )`

This method is used to fetch a set of records from the data source. The attributes taken into consideration in `request` are:

* `request.remote`.
* `request.params`. For remote requests, adds filtering restrictions to the query so that only matching records will be fetched. For local request, such extra filtering should be avoided.
* `request.options`. The options object that will define what data is to be fetched. Specifically:
  * `request.options.conditions`: an object specifying key/value criteria to be applied for filtering
  * `request.options.sort`: an object specifying how sorting should happen. For example `{ surname: -1, age: 1  }`.
  * `request.options.range`: an object with up to attributes:
    * `limit` must make sure that only a limited number of records are fetched;
    * `skip` must make sure that a number of records are skipped.
  * `request.options.delete`: if set to `true`, each fetched record will be deleted after fetching. The default is the store's own `self.deleteAfterGetQuery` attribute (which is itself `false` by default).
  * `request.options.skipHardLimitOnQueries`: if set to `true`, the limitation set by the store's own attribute `hardLimitOnQueries` will not be applied.

Note that two store attributes must be taken into consideration:

* `self.hardLimitOnQueries`. This is the maximum number of results that must be returned. Note that `implementQuery()` might have `request.options.skipHardLimitOnQueries` set to `true`: in this case, the limit mustn't be applied.
* `self.deleteAfterGetQuery`. Acts as a default for the `request.options.delete` attribute: if `request.options.delete` is not set, whatever `self.deleteAfterGetQuery` is set to must be used as a default.

The callback `cb()` must be called with the fetched elements as its second parameter, or an empty array if nothing was found.

While filtering by `request.params` is straightforward, as it must just make sure that every attribute set in `request.params` matches the corresponding attribute in the object, `request.options.conditions` is a little more complex; `conditions` is a hash of key/value following the `onlineSearchSchema`, and their meaning is set by the `queryConditions` attribute in the store (see the [queryConditions section](#custom-queryconditions) in this guide).

So, in a naked, non-database store you should still make sure that `queryConditions` is set properly, and that queries will honour what's specified in it. If your `queryConditions` is:

    queryConditions: {
      type: 'startsWith',
      args: [ 'surname', '#surname#']
    },

If `request.options.conditions` has as `surname` key, you should filter your data so that only records where the `surname` attribute starts with `request.options.conditions.surname` are returned.

This is what SimpleDbLayerMixin does automatically (it recursively visits `queryConditions` and creates the appropriate query for the right database). However, in a naked non-database store, writing a function that parses `queryConditions` is definitely an overkill.

This does have the implication that inheriting from a naked store is possible, but if you change `queryConditions` you will also have to re-write `implementQuery` so that filtering matches what `queryConditions` says.

While there is no practical reason, server side, to make sure that `queryConditions` matches the way queries are carried out by the store, it's also true that other components, are aware of how the store works in terms of searching; a client-store fetching data, for example, might want to be able to emulate the store's behaviour in terms of searching to keep refreshing of data at minimum.

## `implementReposition( doc, where, beforeId, cb )`

This method is used to reposition a field in the data source. It's the only call to the API with a slightly different signature. This function should only do anything if `store.position` is set to `true`.

Its parameters are:

* `doc`. The record that needs to be moved. Most implementation will only ever taken into account `doc[ self.idProperty ]`.
* `where`. Where to place the element. It can be:
 * `start`. Place the element first.
 * `end`. Place the element last.
 * `before`. Place the element before the one with ID `beforeId`.
* `beforeId`. Only used when `where` is `before`: it's the ID of the element.

The callback only have the `err` parameter.

# What happens exactly in each request

It's important to understand what happens in each request, so that you know exactly what you know when your hooks are called in the request's life cycle.

JsonRestStores does all of the boring stuff for you -- the kind things that you would write over and over and over again while developing a server store. However, it's important to know "how" the boring stuff is done.

(When you read these, think about all of the boring work JsonRestStores is doing for you for every store you define!)

### `_makeGetQuery()` (for GET requests, no ID)

* (CHECK) check that `self.handleGetQuery` is true for remote requests. If false, send `NotImplementedError`
* (CHECK) incoming `request.params` (`:ids` from URL) match types of `store.paramIds` array (type is taking from schema). If fail, send `BadRequestError`
* (HOOK) `self.checkPermissions( request, 'getQuery' )` is run. If fail, send `ForbiddenError`
* (CHECK) Search terms (request.options.conditions) are cast against the onlineSearchSchema. If fail, send `BadRequestError`
* (HOOK) `self.afterValidate( request, 'getQuery' )` is run
* (INTERFACE) `implementQuery( request )` is run. => `request.data.fullDocs`, `request.data.total`, `request.data.grandTotal`
* (HOOK) `self.afterDbOperation( request, 'get' )` is run
* (DATA) `self.extrapolateDoc( fulldocs )` and `self.prepareBeforeSend( request, doc )` are run for each element in `fullDocs` => `request.data.docs`, `request.data.preparedDocs`
* (HOOK) `self.afterEverything( request )` is run
* (DATA) `preparedDocs` is sent as array (status: 200)/returned as array (for API). Party!

### `_makeGet()` (for `GET` requests, with ID)

* (CHECK) check that `self.handleGet` is true for remote requests. If false, send `NotImplementedError`
* (CHECK) incoming `request.params` (`:ids` from URL) match types of `store.paramIds` array (type is taking from schema). If fail, send `BadRequestError`
* (INTERFACE) `implementFetchOne( request )` is run. If record isn't there, send `NotFoundError` => `request.data.fullDoc`
* (HOOK) `self.afterDbOperation( request, 'get' )` is run
* (DATA) `self.extrapolateDoc( request, 'get', fullDoc )` is run against the record just fetched => `request.data.doc`
* (HOOK) `self.checkPermissions( request, 'get' )` is run. If fail, send `ForbiddenError`
* (HOOK) `self.afterCheckPermissions( request, 'get' )` is run
* (DATA) `self.prepareBeforeSend( request, 'get', doc )` is run => `request.data.preparedDoc`
* (HOOK) `self.afterEverything( request, 'get' )` is run
* (DATA) `doc` is sent (status: 200)/returned (for API). Party!

### `_makeDelete()` (for DELETE requests)
* (ATTR) check that `self.handleDelete` is true for remote requests. If false, send `NotImplementedError`
* (CHECK) incoming `request.params` (`:ids` from URL) match types of `store.paramIds` array (type is taking from schema). If fail, send `BadRequestError`
* (INTERFACE) `implementFetchOne( request )` is run. If record isn't therem send `NotFoundError` => `request.data.fullDoc`
* (DATA) `self.extrapolateDoc( request, 'delete', fullDoc )` is run against the record just fetched => `request.data.doc`
* (HOOK) `self.checkPermissions( request, 'delete' )` is run. If fail, send `ForbiddenError`
* (INTERFACE) `implementDelete( request )` is run. If record isn't therem send `Error`
* (HOOK) `self.afterDbOperation( request, 'delete' )` is run
* (DATA) `self.prepareBeforeSend( request, 'delete', doc )` is run => `request.data.preparedDoc`
* (HOOK) `self.afterEverything( request, 'delete' )` is run
* (DATA) `preparedDoc` is sent (status: 200, if remote)/returned (for API). Party!

### `_makePost()` (for POST requests)
* (ATTR) check that `self.handlePost` is true for remote requests. If false, send `NotImplementedError`
* (CHECK) incoming `request.params` (`:ids` from URL) match types of `store.paramIds` array (type is taking from schema). If fail, send `BadRequestError`
* (HOOK) `self.prepareBody( request, 'post', request.body)` is run => preparedBody
* (DATA) `request.body` is assigned to `prepareBody`; the original `body` is still available as `request.bodyBeforePrepare
* (DATA) For remote requests, `body` is enriched with the elements in `request.params`. Existing attributes will be overwritten.
* (CHECK) Body (`request.body`) is cast against the store's schema (skipping `idProperty`, since it's a post and `idProperty` isn't set). If fail, send `BadRequestError` => validatedBody
* (CHECK) If fields with `protected` set to `true` in the schema are present in the body, return `UnprocessableEntityError`
* (DATA) `request.body` is assigned to `validatedBody`; the original `body` is still available as `request.bodyBeforeValidation
* (HOOK) `self.afterValidate( request, 'post' )` is run
* (HOOK) `self.checkPermissions( request, 'post' )` is run. If fail, send `ForbiddenError`
* (HOOK) `self.afterCheckPermissions( request, 'post' )` is run
* (DATA) All fields with `doNotSave` set to `true` in the schema are purged from `request.body`
* (INTERFACE) `implementInsert( request, forceId )` is run. If record isn't therem send `Error` => `request.data.fullDoc`
* (INTERFACE) `implementReposition( request, ... )` is run. Parameters will depend on `request.options.putBefore` and `request.options.putDefaultPosition`.
* (HOOK) `self.afterDbOperation( request, 'post' )` is run
* (DATA) `self.extrapolateDoc( request, 'post', fullDoc )` is run against the record just added => `request.data.doc`
* (DATA) `self.prepareBeforeSend( request, 'post', doc )` is run => `request.data.preparedDoc`
* (HOOK) `self.afterEverything( request, 'post' )` is run
* (DATA) `preparedDoc` is sent (status: 201, if remote and `echoAfterPost`)/returned (for API). Party!

### `_makePut()` (for PUT requests)

* (ATTR) check that `self.handlePut` is true for remote requests. If false, send `NotImplementedError`
* (CHECK) incoming `request.params` (`:ids` from URL) match types of `store.paramIds` array (type is taking from schema). If fail, send `BadRequestError`
* (HOOK) `self.prepareBody( request, 'put', request.body )` is run => preparedBody
* (DATA) `request.body` is assigned to `prepareBody`; the original `body` is still available as `request.bodyBeforePrepare
* (DATA) For remote requests, `body` is enriched with the elements in `request.params`. Existing attributes will be overwritten.
* (CHECK) Body (`request.body`) is cast against the store's schema. If fail, send `BadRequestError` => validatedBody
* (CHECK) If fields with `protected` set to `true` in the schema are present in the body, return `UnprocessableEntityError`
* (DATA) `request.body` is assigned to `validatedBody`; the original `body` is still available as `request.bodyBeforeValidation
* (HOOK) `self.afterValidate( request, 'put' )` is run
* (INTERFACE) `implementFetchOne( request )` is run => `request.data.fullDoc`
* (CHECK) Check if `request.options.overwrite` is set. If it is, then apply restraints: 1) if `overwrite` is `true`, then `fullDoc` _must_ be set (existing record) 2) if `overwrite` is `false`, then `fullDoc` _must_ be null (new record)

#### ...and then, for NEW records (`implementFetchOne` returned `fullDoc` as `null`)
* (DATA) `request.putNew` is set to `true`
* (HOOK) `self.checkPermissions( request, 'put' )` is run. If fail, send `ForbiddenError`
* (HOOK) `self.afterCheckPermissions( request, 'post' )` is run
* (DATA) All fields with `doNotSave` set to `true` in the schema are purged from `request.body`
* (INTERFACE) `implementInsert( request, null )` is run. If record isn't therem send `Error` => `request.data.fullDoc`
* (INTERFACE) `implementReposition( request, ... )` is run. Parameters will depend on `request.options.putBefore` and `request.options.putDefaultPosition`.
* (HOOK) `self.afterDbOperation( request, 'put' )` is run
* (DATA) `self.extrapolateDoc( request, 'put', fullDoc )` is run against the record just added => `request.data.doc`
* (DATA) `self.prepareBeforeSend( request, 'put', doc )` is run => `request.data.preparedDoc`
* (HOOK) `self.afterEverything( request, 'put' )` is run
* (DATA) `preparedDoc` is sent (status: 201, if remote and `echoAfterPut`)/returned (for API). Party!

#### ...or  then, for EXISTING records (`implementFetchOne` returned `fullDoc` not `null`):

* (DATA) `request.putExisting` is set to `true`
* (DATA) => `request.data.fullDoc`
* (DATA) `self.extrapolateDoc( request, 'put', fullDoc )` is run against the record just fetched => `request.data.doc`
* (HOOK) `self.checkPermissions( request, 'put' )` is run. If fail, send `ForbiddenError`
* (HOOK) `self.afterCheckPermissions( request, 'post' ) is run
* (DATA) All fields with `doNotSave` set to `true` in the schema are purged from `request.body`
* (INTERFACE) `implementUpdate( request, true )` is run. If record isn't therem send `Error` => `request.data.fullDocAfter`
* (INTERFACE) `implementReposition( request, ... )` is run. Parameters will depend on `request.options.putBefore` and `request.options.putDefaultPosition`.
* (HOOK) `self.afterDbOperation( request, 'put' )` is run
* (DATA) `self.extrapolateDoc( request, 'put', fullDocAfter )` is run against the record just added => `request.data.docAfter`
* (DATA) `self.prepareBeforeSend( request, 'put', docAfter )` is run => `request.data.preparedDoc`
* (HOOK) `self.afterEverything( request, 'put' )` is run
* (DATA) `preparedDoc` is sent (status: 200, if remote and `echoAfterPut`)/returned (for API). Party!

# Implementing protocol mixins

JsonRestStores is protocol-agnostic: both listening for requests, and sending data out, is 100% abstracted. Even the reference HTTP mixin, `HTTPMixin`, is replecable if you want to change the way JsonRestStores provides headers, or if you'd like to manipulate data before sending it out.

In order to work, a protocol mixin needs to implement the following methods:

## protocolListenNAME( params )

Here, `NAME` is the name of the protocol. For example, when you write `protocolListen( 'HTTP', { app: app } );`, you are actually running `protocolListenHTTP( { app: app } )`.

In `params`, you need to pass the parameters specific for that protocol. For example, in case of `HTTP`, the function is expecting an `app` parameter (so that it can add the Express routes exported by the store).

For each REST request, this method is expected to create a `request` object (with `new Object()`) and set the following attributes:

* `remote`: set to `true`;
* `protocol`: set to the protocol's name (e.g. `HTTP`)
* `params`: set to the URL parameters. For example, a request like this: `PUT /managers/10/cars/20` will have `params` set as `{ managerId: 10, id: 20 }`
* `body`: set to the request's `body`
* `session`: a variable that is going to keep between requests made by the same client. The mechanism will depend on the protocol used.
* `options`: the options, based on the request itself. With HTTP, they are worked out from query string and headers. Note that if `request.options.delete` is not set, and the store's `this.deleteAfterGetQuery` is `true`, then request.options.delete should be honoured and set to `true`.

At that point, the function will need to call the right request handler (`makeGet()`, `makeGetQuery()`, etc.) depending on the request received, honouring the store's `this.artificialDelay` attribute.

Specific protocols can set extra attributes. For example HTTP sets `_req` and _res` as the Express' `req` and `res` objects. Doing so is important, because `request._res.json()` and `request._res.send()` will be used by the the protocol's sending function to send data to the client.

## protocolSendNAME ( request, method, data, cb )

Once the request handler has finished processing the request, calls the store's method  `self.sendData(  request, method, returnObject );` to get it delivered to the client.

`sendData()`, in turn, will call `protocolSendNAME()` where `NAME` is `request.protocol`. So, for `HTTP` requests, `protocolSendHTTP( request, method, returnObject )` will be called. This method has access to the `request` attribute, which (as mentioned earlier) was assigned `_req` and `_res`. `req._res` is used by `protocolSendHTTP()` to set the right HTTP headers and deliver the response to the client.

There is a special case in terms of the `method` argument: it can be the method used, or it could be `'error'` (a string literal with the word `error` in it): in this case, it means that something went wrong while processing the request, and that JsonRestStores is actually running `self.sendData( request, 'error', error );`, where the last `error` parameter is the error object itself. So, in this case `data` will actually be an error object with the following extras:

* `responseBody`: what JsonRestStores wants to return in terms of data. This is the result of the store's `self.formatErrorResponse()`,  which you can redefine
* `originalMethod`: the original method that originated the error

### Internal hooks

Sending data is the end of the road in terms of requests. So, you don't actually get the benefit of being able to have a callback with `err` set if things go wrong.

This is why `sendData()` is implemented like this:

    sendData: function( request, method, data ){

      var n = 'protocolSend' + request.protocol;
      var f = this[ n ];

      var self = this;

      // The method must be implemented
      if( !f ) throw ("Error: function self." + n + " not implemented!");

      // Call the `internalBeforeSendData()` hook
      self._internalBeforeSendData( request, method, data, function( err ){
        if( err ) return self.errorInSending( request, method, data, 'before', err );

        // Call the function that _actually_ sends data
        f.call( self, request, method, data, function( err ){
          if( err ) return self.errorInSending( request, method, data, 'during', err );

          // Call the `internalAfterSendData()` hook
          self._internalAfterSendData( request, method, data, function( err ){
            if( err ) return self.errorInSending( request, method, data, 'after', err );

            // No-op. This is the end of the call chain.
          });
        });
      })
    },

So, two "internal" hooks are called: `_internalBeforeSendData()` and `internalAfterSendData()`. They have the `internal` prefix because these hooks should only really be redefined by protocol handlers (like HTTPMixin).
Protocol mixins can decide to redefine these methods, making sure that `this.inheritedAsync()` is called while doing so.

If those methods return with an error, the store's method `errorInSending()` is called:

    errorInSending: function( request, method, data, when, error ){
      self.logError( error );
    },

By default, this method simply logs the problem. However, in a real application you may want to consider a more careful approach.

# Conclusion

I started writing this module to make it easy to write stores. While it _is_ really easy to create (self-documenting!) stores with JsonRestStores, and the module itself is quite simple in the way it works, there _is_ a lot to learn, especially if you want to use its more advanced features (APIs, etc.)

The time saved in the long run is remarkable.
