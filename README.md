JsonRestStores
==============

JsonRestStores is the best way to create REST stores that return JSON data.
Rundown of features:

**WARNING: JsonRestStore Release Candidate 1 is finished, and I am in the process of rewriting its documentation. Please keep un mind that the current documentation does NOT reflect how the module curretly works! Anything after the heading "DOCUMENTATION UPDATED UP TO THIS POINT" is horribly out of date**

* **DRY approach**. Everything works as you'd expect it to, even though you are free to tweak things.
* **Database-agnostic**. You can either use a generic database connector, or implement the data-manipulation methods yourself.
* **Schema based**. Anything coming from the client will be validated and cast to the right type.
* **API-ready**. Every store function can be called via API, which bypass permissions constraints
* **Tons of hooks**. You can hook yourself to every step of the store processing process: `afterValidate()`,   `afterCheckPermissions()`, `afterDbOperation()`, `afterEverything()`
* **Authentication hooks**. Only implement things once, and keep authentication tight.
* **Mixin-based**. You can add functionality easily.
* **Inheriting stores**. You can easily derive a store from another one.
* **Simple error management**. Errors can be chained up, or they can make the store return them to the client.

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

It sounds simple enough (although it's only two tables and it already looks rather boring). It gets tricky when you consider that:

* You need to make sure that permissions are always carefully checked. For example, only users that are part of booking `1234` can `GET /bookings/1234/users`
* When implementing `GET /bookings/`, you need to parse the URL in order to enable data filtering (for example, `GET /bookings?dateFrom=1976-01-10&name=Tony` will need to filter, on the database, all bookings made after the 10th of January 1976 by Tony).
* When implementing `GET /bookings/`, you need to return the right `Content-Range` HTTP headers in your results so that the clients know what range they are getting.
* When implementing `GET /bookings/`, you also need to make sure you take into account any `Range` header set by the client, which might only want to receive a subset of the data
* With `POST` and `PUT`, you need to make sure that data is validated against some kind of schema, and return the appropriate errors if it's not.
* With `PUT`, you need to consider the HTTP headers `If-match` and `If-none-match` to see if you can//should//must overwrite existing records 
* All unimplemented methods should return a `501 Unimplemented Method` server response

This is only a short list of obvious things. There are many more to consider. The point is, when you make a store you should be focusing on the important parts (the data you manipulate, and permission checking) rather than repetitive, boilerplate code.

With JsonRestStores, you can create JSON REST stores without ever worrying about any one of those things. You can concentrate on what _really_ matters: your application's data and logic.

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

````Javascript
    var JsonRestStores = require('jsonreststores'); // The main JsonRestStores module
    var Schema = require('simpleschema');  // The main schema module
    var SimpleDbLayer = require('simpledblayer');
    var MongoMixin = require('simpledblayer-mongo')
    var declare = require('simpledeclare');

    // The DbLayer constructor will be a mixin of SimpleDbLayer (base) and
    // MongoMixin (providing mongo-specific driver to SimpleDbLayer)
    var DbLayer = declare( SimpleDbLayer, MongoMixin, { db: db } );

    // Basic definition of the manages store
    var Managers = declare( JsonRestStores, JsonRestStores.SimpleDbLayerMixin, {

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
    managers.setAllRoutes( app );
````

Note that since you will be mixing in `JsonRestStores` and `JsonRestStores.SimpleDbLayerMixin` for every single store you create, you might decide to create the mixin once for all making the code less verbose:

````Javascript
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

    // Basic definition of the manages store
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
    managers.setAllRoutes( app );
````

That's it: this is enough to add, to your Express application, a a full store which will handly properly all of the HTTP calls.

* `Managers` is a new constructor function that inherits from `JsonRestStores` (the main constructor for JSON REST stores) mixed in with `JsonRestStores.SimpleDbLayerMixin` (which gives `JsonRestStores` the ability to manipulate data on a database).
* `DbLayer` is a SimpleDbLayer constructor mixed in with `MongoMixin`, the MongoDB-specific layer for SimpleDbLayer. So, `DbLayer` will be used by `Managers` to manipulate MongoDB collections. 
* `schema` is an object of type Schema that will define what's acceptable in a REST call.
* `publicURL` is the URL the store is reachable at. ***The last one ID is the most important one***: the last ID in `publicURL` (in this case it's also the only one: `id`) defines which field, within your schema, will be used as _the_ record ID when performing a PUT and a GET (both of which require a specific ID to function).
* `storeName` (_mandatory_) needs to be a unique name for your store. It is mandatory to have one. 
* `handleXXX` are attributes which will define how your store will behave. If you have `handlePut: false` and a client tries to PUT, they will receive an `NotImplemented` HTTP error.
* `managers.setAllRoutes( app )` creates the right Express routes to actually activate your stores. Specifically:

    // Make entries in "app", so that the application
    // will give the right responses
    app.get(      url + idName, this.getRequestHandler( 'Get' ) );
    app.get(      url,          this.getRequestHandler( 'GetQuery') );
    app.put(      url + idName, this.getRequestHandler( 'Put') );
    app.post(     url,          this.getRequestHandler( 'Post') );
    app.delete(   url + idName, this.getRequestHandler( 'Delete') );

So, the following routes will be defined:

    GET /managers/:id (returns a specific manager)
    GET /managers/ (returns a collection of elements; you can filter by surname, which is searchable)
    PUT /managers/:id (writes over an existing manager object)
    POST /managers/ (creates a new manager object)
    DELETE /managers/:id (deletes a manager)

## The store live in action in your express application

JsonRestStores is very unobtrusive of your Express application. In order to make everything work, you can just:

 * Generate a new ExpressJS application
 * Connect to the database
 * Define the stores using the code above.

This is how the stock express code would change to implement the store above (please note that this is mostly code autogenerated when you generate an Express application):

````Javascript
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
      managers.setAllRoutes( app );

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
````

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

    $ curl -i -GET  http://localhost:3000/managers/?surname=fabbietti
    HTTP/1.1 200 OK
    X-Powered-By: Express
    Content-Type: application/json; charset=utf-8
    Content-Length: 2
    ETag: "1058662527"
    Date: Mon, 02 Dec 2013 02:22:29 GMT
    Connection: keep-alive

    []

    $ curl -i -X PUT -d "name=Merc&surname=Mobily"  http://localhost:3000/managers/2
    HTTP/1.1 200 OK
    X-Powered-By: Express
    Location: /managers/2
    Content-Type: application/json; charset=utf-8
    Content-Length: 54
    Date: Mon, 02 Dec 2013 02:23:29 GMT
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

For example, the constructor `JsonRestStores` use on its own is hardly useful: it creates Json REST stores with the following data-manipulation methods left unimplemented (they will throw an error if they are run):

 * implementFetchOne: function( request, cb ){
 * implementInsert: function( request, forceId, cb ){
 * implementUpdate: function( request, deleteUnsetFields, cb ){
 * implementDelete: function( request, cb ){
 * implementQuery: function( request, next ){
 * implementReposition: function( doc, where, beforeId, cb ){
  
Implementing these methods is important to tell `JsonRestStores` how to actualy manipulate the store's data. This is exactly what `JsonRestStores.SimpleDbLayerMixin` does: it's a mixin that enriches the basic `JsonRestStore` objects with all of the methods listed above, using a database as data storage.

So when you write:

    var Managers = declare( JsonRestStores, `JsonRestStores.SimpleDbLayerMixin`, {

You are creating a constructor function, `Managers`, mixing in the prototypes of `JsonRestStores` (the generic, unspecialised constructor for Json REST stores) and `JsonRestStores.SimpleDbLayerMixin` (which provides working methods actually implementing `implementFetchOne()`, `implementInsert(), etc.).

`SimpleDbLayerMixin` will use the `DbLayer` attribute of the store as the constructor used to create "table" objects, and will manipulate data with them.

`DbLayer` itself is created using the same pattern as `Managers`.

SimpleDbLayer on its own is useless: it creates a DB layer with the following methods left unimplemented:

* select( filters, options, cb )
* update( conditions, updateObject, options, cb )
* insert( record, options, cb )
* delete( conditions, options, cb )
* reposition: function( record, where, beforeId, cb )

The implementation will obviously depend on the database layer. So, when you type:

    var DbLayer = declare( SimpleDbLayer, MongoMixin );

You are creating a constructor function, `DbLayer`, that is the mixin of `SimpleDbLayer` (where `select()` `update()` etc. are not implemented) and `MongoMixin` (which implements `select()`, `update()` etc. using MongoDB as the database layer).

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

    managers.setAllRoutes( app );

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
    managers.setAllRoutes( app ); // This will throw()

Note that:
 * The `id` parameter had to be defined in the schema
 * The `paramIds` array had to be defined by hand
 * `managers.setAllRoutes( app )` can't be used as the public URL is not there

This pattern is much more verbose, and it doesn't allow the store to be placed online with setAllRoutes.

In any case, the property `idProperty` is set as last element of `paramIds`; in this example, it is `id`.

In the documentation, I will often refers to `paramIds`, which is an array of element in the schema which match the ones in the route. However, in all examples I will use the "shortened" version without repeating IDs unnecessarily.

# A nested store

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
    managers.setAllRoutes( app );

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
    managersCars.setAllRoutes( app );
 
You have two stores: one is the simple `managers` store with a list of names and surname; the other one is the `managersCars` store: note how the URL for `managersCars` includes `managerId`.

The managersCars store will will respond to `GET /managers/2222/cars/3333` (to fetch car 3333 of manager 2222), `GET /workspace/2222/users` (to get all cars of manager 2222), and so on.

Remember that in `managersCars` _remote queries will **always** honour the filter on `managerId`, both in queries (`GET` without an `id` as last parameter) and single-record operations_ (`GET` with a specific `id`).

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
          layer: 'managersCars',
          join: { managerId: 'id' },
        }
      ],

    });
    var managers = new Managers(); 
    managers.setAllRoutes( app );

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
          layer: 'managers',
          layerField: 'id'
        }
      ],
    });
    var managersCars = new ManagersCars();
    managersCars.setAllRoutes( app );


This is an example where using JsonRestStores really shines: when you use `GET` to fetch a manager, the object's attribute `manager._children.managersCars` will be an array of all cars joined to that manager. Also, when yu use `GET` to fetch a car, the object's attribute `car._children.managerId` will be an object representing the correct manager. This is immensely useful in web applications, as it saves tons of HTTP calls for lookups.

Fetching of nested data is achieved by SimpleDbLayerMixin by using [SimpleDbLayer's nesting abilities](https://github.com/mercmobily/simpledblayer#automatic-loading-of-children-joins), which you should check out. 

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
    managers.setAllRoutes( app );

    var People = declare( Store, { 

      schema: new Schema({
        // ...
      });

      publicUrl: '/people/:id',

      storeName: `people`
      // ...
    }
    var people = new People();
    people.setAllRoutes( app );

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
    managers.setAllRoutes( app );

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
    managerCars.setAllRoutes( app );

* The nested store's name starts with the parent store's name (`managers`) keeping pluralisation
* The URL is in small letters, starting with the URL of the parent store

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
    managers.setAllRoutes( app );


If you query the store with `http://localhost:3000/managers/?surname=mobily`, it will only return elements where the `surname` field matches.

## Custom `onlineSearchSchema`

In JsonRestStores you actually define what fields are acceptable as filters with the parameter `onlineSearchSchema`, which is defined exactly as a schema. So, writing this is equivalent:

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
    managers.setAllRoutes( app );

If `onlineSearchSchema` is not defined, JsonRestStores will create one based on your main schema by doing a shallow copy, excluding `paramIds` (which means that `id` is not added automatically to `onlineSearchSchema`, which is most likely what you want).

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
        name: 'eq', 
        args: [ 'name', '#name#']
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
    managers.setAllRoutes( app );

Basically, `queryConditions` is automatically generated with the `name` field in the database that matches the `name` entry in the query string (that's what `#name#` stands for).

If you had defined both `name` and `surname` as searchable, `queryConditions` would have been generated as:

    queryConditions: {
        name: 'and',
        args: [
          { name: 'eq', args: [ 'name', '#name#' ] },
          { name: 'eq', args: [ 'surname', '#surname#' ]
        ]
      },
     
Basically, _both_ `name` and `surname` need to match their respective values in the query string. To know more about the syntax of `queryConditions`, please have a look at [the conditions object in SimpleDbLayer](https://github.com/mercmobily/simpledblayer#the-conditions-object).

Keep in mind that the syntax of JsonRestStore's `queryConditions` is identical to the syntax of the `conditions` object in SimpleDbLayer, with the following extras:

* In JsonRestStores, when a value is in the format `#something#`, that `something` will be replaced by the value in the corresponding value in the query string when making queries. _If `something` is not passed in the query string, that section of the query is ignored._ 
* You can have the attribute `ifDefined` set as a value in `queryConditions`: in this case, that section of the query will only be evaluated if the corresponding value in the query string is defined.

For example, you could define `queryConditions` as:

    queryConditions: {
      name: 'and',
      args: [

        {
          name: 'and', ifDefined: 'surname', args: [
            { name: 'startsWith', args: [ 'surname', '#surname#' ] },
            { name: 'eq', args: [ 'active', true ] },              
          ]
        },

        { 
          name: 'startsWith', args: [ 'name', '#name#']
        }
      ]
    },

The strings `#surname#` and `#name#` are translated into their corresponding values in the query string. The `ifDefined` means that that whole section of the query will be ignored unless `surname` is passed to the query string. The comparison operators, which were `eq` in the generated `queryConditions`, are now much more useful `startsWith`.

You can clearly see that thanks to `queryConditions` you can effectively create _any_ kind of query based on the passed parameter. For exampe, you could create a `searchAll` field like this:

    onlineSearchSchema: new Schema( {
      searchAll: { type: 'string', trim: 60 },
    }),

    queryConditions: {
      name: 'or',
      ifDefined: 'searchAll',
      args: [
        { name: 'startsWith', args: [ 'number', '#searchAll#' ] },
        { name: 'startsWith', args: [ 'firstName', '#searchAll#' ] },
        { name: 'startsWith', args: [ 'lastName', '#searchAll#' ] },
      ]
    },

This example highlights that `onlineSearchSchema` fields don't have to match existing fields in the schema: they can be _anything_, which is then used as a `#field#` value in `queryConditions`. They are basically values that will be used when constructing the actual query in `queryConditions`.

This makes JsonRestStores immensely flexible in terms of what queries can be implemented.

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
        name: 'and',
        args: [

          {
            name: 'startsWith', args: [ 'surname', '#surname#']
          },

          {
            name: 'or',
            ifDefined: 'carInfo',
            args: [
              { name: 'startsWith', args: [ 'managersCars.make', '#carInfo#' ] },
              { name: 'startsWith', args: [ 'managersCars.model','#carInfo#' ] },
            ]
          }
        ]
      },

      nested: [
        {
          type: 'multiple',
          layer: 'managersCars',
          join: { managerId: 'id' },
        }
      ],

    });
    var managers = new Managers(); 
    managers.setAllRoutes( app );

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
        name: 'and',
        args: [

          {
            name: 'startsWith', args: [ 'make', '#make#'],            
          },

          {
            name: 'startsWith', args: [ 'model', '#model#'],            
          },

          {
            name: 'or',
            ifDefined: 'managerInfo',
            args: [
              { name: 'startsWith', args: [ 'managers.name', '#managerInfo#' ] },
              { name: 'startsWith', args: [ 'managers.surname','managerInfo#' ] },
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
          layer: 'managers',
          layerField: 'id'
        }
      ],
    });
    var managersCars = new ManagersCars();
    managersCars.setAllRoutes( app );

You can see how for example in `Managers`, `onlineSearchSchema` has a mixture of fields that match the ones in the schema (`name`, `surname`) that look for a match in the correponding fields, as well as search-specific fields (like `carInfo`) that end up looking into the nested children.

It's totally up to you how you want organise your searches. For example, you might decide to make a `searchAll` field instead for `Managers`:

    onlineSearchSchema: new HotSchema({
      searchAll : { type: 'string', trim: 60 },
    }),

    queryConditions: {
      name: 'or',
      ifDefined: 'searchAll',
      args: [
        { name: 'startsWith', args: [ 'name', '#searchAll#'] }
        { name: 'startsWith', args: [ 'surname', '#searchAll#'] }
        { name: 'startsWith', args: [ 'managersCars.make', '#searchAll#' ] },
        { name: 'startsWith', args: [ 'managersCars.model','#searchAhh#' ] },
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
          layer: 'managersCars',
          join: { managerId: 'id' },
        }
      ],

    });
    var managers = new Managers(); 
    managers.setAllRoutes( app );

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
          layer: 'managers',
          layerField: 'id'
        }
      ],
    });
    var managersCars = new ManagersCars();
    managersCars.setAllRoutes( app );

In this case, I didn't define `onlineSearchSchema` nor `queryConditions`: the store will get the default ones provided by JsonRestStores.

Note how `sortableFields` is an array of fields that will be taken into consideration. Each element of the array will be a field in the schema itself.

It is interesting how one of the sortable fields is `managers.name`: since `managers` is a nested table, its sub-fields can be used as sorting fields (as long as they are searchable).

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
    comments.setAllRoutes( app );

This will ensure that comments are always retrieved in reversed order, newest first. Since `sortableFields` is not defined, the default order (by `posted`) is the only possible one for this store.

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

````

The `position` attribute means that `PUT` and `POST` calls will have to honour the positioning headers if they are passed (or the `options.putBefore` and `options.putDefaultPosition` options if using the API).

Specifically:

* `X-put-default-position`. It can be `start` and `end`, and it defines where items will be placed if `X-put-before` is not set.
* `X-put-before`. If set, the item will be placed _before_ the one with the ID corresponding to the header value (and `X-put-default-position` is ignored).

The default position is set to `end` by default.

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

SimpleDbLayerMixin leverage on the positioning features of SimpleDbLayer to implement element positioning in JsoNRestStores.

# Stores and collections when using SimpleDbLayerMixin

When using SimpleDbLayerMixin (which is the most common case, unless you are [implementing data manipulation functions on your own](TODO)), a SimpleDbLayer collection will be created using the following attributes passed to the store:

  * `idProperty`: the same as `store.idProperty`
  * `schema`: the same as `store.schema`
  * `nested`: the same as `store.nested`
  * `hardLimitOnQueries`: the same as `store.hardLimitOnQueries`
  * `strictSchemaOnFetch`: the same as `store.strictSchemaOnFetch`

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

This allows you to potentially define SimpleDbLayer's layers beforehand, and then use them in JsonRestStores.
If you decide to do so, remember to set `fetchChildrenByDefault` to true, and `schemaError` to `e.UnprocessableEntityError`. You will also need to set your own `positionField` and `positionBase` manually if you want positioning to happen. Generally speaking, it's just easier and better to let JsonRestStores create your SimpleDbLayer collections.

# Inheriting a store from another one (advanced)

At this point it's clear that stores are defined as constructor classes, which are then used -- only once -- to create a store variable. For example the constructor `Managers()` is used to create the `managers` store with `managers = new Managers()`.

This allows you to define a base store, and derive stores off that base store. For example:

````Javascript

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

      // NOTE: no idParams nor publicURL is defined.
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
````

In this example, `WorkspacesUsersBase` is used as a starting point, defining `schema` and `idProperty`. Note that all `id` fields are defined in the schema manually (since there was no `paramIds` nor `publicURL` defined to do it magically). `WorkspacesUsersBase` also defines `workspacesUsers` as `collectionName` (otherwise, `collectionName` would have been `workspacesUsersBase`). Two specialised stores are then inherited from `WorkspacesUsersBase`: `WorkspacesUsers` and `UsersWorkspaces`. They both enable `handleGetQuery` and are assigned different URLs, and therefore have different paramIds; however, they both use the same database collection called `workspacesUsers`.

When you inherit a store using SimpleDbLayerMixin, you need to remember that **collections are always recycled if they were already defined by a previous store**.

In this particular case, when you run `stores.workspacesUsersBase = new WorkspacesUsersBase();` you are actually creating a SimpleDbLayer collection called `workspacesUsers`. Since derived constructors `WorkspacesUsers` and `UsersWorkspaces` define `workspacesUsers` as their collection, _the collection will be recycled since it already exists_.
This means that the following attributes of the store will be reused (and redefining them in the derived store will have no effect):

* idProperty (from the store's `idProperty` attribute)
* schema (from the store's `schema` attribute)
* hardLimitOnQueries (from the store's `hardLimitOnQueries` attribute)
* strictSchemaOnFetch (from the store's `strictSchemaOnFetch` attribute)

This means that a derived store cannot redefine `idProperty`, `schema`, `hardLimitOnQueries`, `strictSchemaOnFetch` (since they are used to create the store when the base store is created).

This also means that position grouping will depend on the _base_ constructor's `paramIds`, since the collection's `positionBase` will depend _only_ on the base class' `paramIds`. (Note: `positionBase` in a collection defines which fields are used to 'group' ordering, see [how repositioning works in SimpleDbLayer](https://github.com/mercmobily/simpledblayer#nested-record-positioning)). This will only affect you if you are creating derived stores with positioning.

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


````Javascript
    [
      { field: 'nameOfFieldsWithProblems', message: 'Message to the user for this field' },
      { field: 'nameOfAnotherField', message: 'Message to the user for this other field' },
    ]
````

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



# DOCUMENTATION UPDATED UP TO THIS POINT

# TODO:
 * Document what happens to schema thanks to SimpleDbLayerMixin (fields made searchable)
 * Document properly all of the hooks (2 types)
 * Document what happens when a request arrives
 * Document _exactly_ how to implement implement*** fields
 * Document _exactly_ how the API works


# Important methods and attributes you can override

The basic `Store` class uses a rather long list of stock methods to complete requests. Some of them are there so that you can override them.

## Data manipulation

### `extrapolateDoc()`

In the documentation and the code, you will often see that two versions of the object are passed: `doc` and `fullDoc`. This is because JsonRestStores allows you to define a method, `extrapolateDoc()`, which will extrapolate the information you actually want to read. Basically, `extrapolateDoc()` is run every time a record is fetched from the database.

You can use this method to manipulate your data every time it's fetched from the database. However, the resulting data _must still conform with the schema after manipulation _, or JsonRestStore will get into an error.

Note that permission functions have both `doc` and `fullDoc` so that they can easily make an "informed" decision on granting or denying access regardless of how the data was manipulated by `extrapolateDoc()`.

The method's signature is:

    extrapolateDoc( request, fullDoc, cb( err, doc ) )`

It's important that you create a copy of `fullDoc` rather than changing it directly. E.g.:

...this is wrong:
    
    extrapolateDoc: function( request, fullDoc, cb){
      // WRONG!!! This will effectively change fullDoc, which IS a side-effect
      doc = fullDoc;
      doc.name = doc.name.toUpperCase();
      cb( null, name );
    }

...this is correct:

    extrapolateDoc: function( request, fullDoc, cb){
      // CORRECT! This will create a copy of fullDoc, and THEN manipulate it
      var doc = {};
      for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
      doc.name = doc.name.toUpperCase();
      cb( null, name );
    }


### `prepareBeforeSend( request, doc, cb )`(

The method `prepareBeforeSend()` does exactly what it says: it will manipulate `doc` just before it's sent over to the client who requested it. This is especialy useful if you want to apply last minute changes to the data you send.

An important difference between `prepareBeforeSend()` and `extrapolateDoc()` is that the data in `prepareBeforeSend()` does __not__ have to conform to the schema at all. This is the right time to add _anything_ you want to it without worrying about breaking the schema.

The method's signature is:

    prepareBeforeSend( request, doc, cb )

The function will manipulate `doc` directly, and will just run `cb( err )` (no extra parameters)

## Indexing functions

The only indexing function available is:

* `generateStoreAndSchemaIndexes( options, cb )` -- The name speaks for itself. `options` can have `background: true` if you want the operation to run in the background

This function will run SimpleDbLayer's generateSchemaIndexes(), as well as adding store-specific indexes:

* Will create an index with all `idParams`
* Will create a new index for each searchable field, in the form `workspaceId + searchableField` since most searches will be run by users within their `workspaceId` domain
* Will create a compound index with `paramIds + field` for each `sortable` field


### `deleteAfterGetQuery`

If set to `true`, any "get query" method will have the side effect of deleting the fetched records from the database. Whatever is set here will be used as the default for `GetQuery` calls from the API.

### `hardLimitOnQueries`

This is the limit of the number of elements that can be returned by a query without ID (GetQuery). The default is 50. 

## Permissions

By default, everything is allowed: stores allow pretty much anything and anything; anybody can DELETE, PUT, POST, etc. Furtunately, JsonRestStores allows you to decide exactly what is allowed and what isn't, by overriding specific methods.

Each permission function needs to call the callback: if everything went fine, `cb()` will be called with `cb( null, true )`; to fail, `cb( null, false )`.

Here are the functions:

 * `checkPermissionsPost( request, cb )` 
 * `checkPermissionsPutNew( request, cb )`
 * `checkPermissionsPutExisting( request, doc, fullDoc, cb )`
 * `checkPermissionsGet( request, doc, fullDoc, cb )`
 * `checkPermissionsGetQuery( request, cb )`
 * `checkPermissionsDelete( request, doc, fullDoc, cb )`

Here is an example of a store only allowing deletion only to specific admin users:

    // The basic schema for the WorkspaceUsers table
    var WorkspaceUsers = declare( JRS, {

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
      
      checkPermissionsDelete: function( request, doc, fullDoc, cb ){

        // User is logged in: all good
        if( this._req.session.user ){
          cb( null, true );

        // User is not logged in: fail!
        } else {
          cb( null, false );
        }

      },

    });

    WorkspaceUsers.onlineAll( app );

Permission checking can be as simple, or as complex, as you need it to be.

Note that if your store is derived from another one, and you want to preserve your master store's permission model, you can run `this.inheritedAsync(arguments)` like so:

      checkPermissionsDelete: function( request, doc, fullDoc, cb ){

        this.inheritedAsync( arguments, function( err, granted ) {

          // In case of error of permission problems from parent, that's it
          if( err ) return cb( err, false );
          if( ! granted) return cb( null, false );

          // User is admin (id: 1 )
          if( this._req.session.user === 1){
            cb( null, true );

          // User is not logged in: fail!
          } else {
            cb( null, false );
          }
       }
     },
 
This will ensure that the inherited `checkPermissionsDelete()` method is called and followed, and _then_ further checks are carried on.

## "Prepare Body" and "after afterValidate" hooks

These hooks are there so that you can manpulate the data passed to your store both _before_ it's validated against the schema, and _after_ it's been validated.

When data is submitted to the store, sometimes you want to manipulate it *before* it gets validated against the schema. For example, your application might pass extra parameters (which are not part of the schema) that will influence the actual schema fields. Or, you might want to manipulate the passed data _after_ validation (which is useful if you want to make absolute sure that all the fields are cast and valid).

* `prepareBody( request, body, method, cb )`
* `afterValidate( request, body, method, cb )`

In both hooks, `method` can be either `"put"` or `"post"`.

`prepareBody()` is called with the data passed from the client _as is_ (no casting, nor anything). Any manipolation done by prepareBody will need to satisfy the schema, or validation will actually fail. This hook is useful if you want to force some fields to specific values, maybe depending on a session variable for the specific user. For example, when a record is created, you will have `creatorId` in the schema, but you won't want users to be able to specify any ID there. So, you can simply assign body.creatorId in the `prepareBody()` hook.

`afterValidate()` is called once validation is completed. This hook is especially useful if you want to make some cross-check on other stores (for example that IDs are correct, etc.); since everything is cast and validated, all IDs are already of the right type.

## "After" hooks

These functions are handy where, in your own applications, you want "something" to happen after one of those operations is complete.

You can redefine them as you wish.

 * `afterPutNew( request, doc, fullDoc, overwrite, cb )` (Called after a new record is PUT)
 * `afterPutExisting( request, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb )` (After a record is overwritten with PUT)
 * `afterPost( request, doc, fullDoc, cb )` (After a new record is POSTed)
 * `afterDelete( request, doc, fullDoc, cb )` (After a record is deleted)
 * `afterGet( request, doc, fullDoc, cb  )` (After a record is retrieved)

Note that these hooks are run **after** data has been written to the database, but **before** a response is provided to the user.





# Store APIs

JsonRestStores allows you to run methods from within your programs, rather than accessing them via URL. This is very helpful if you need to query a store within your own programs.
This is achieved with the following class functions:

* `Store.Get( id, options, next( err, doc ) {})`
* `Store.GetQuery( options, next( err, queryDocs ){} )`
* `Store.Put( id, body, options, next( err, doc ){} )`. __Note: `id` can be set as null if body contains it__
* `Store.Post( body, options, next( err, doc ){} )`
* `Store.Delete( id, options, next( err, doc ){} )`

The `next()` call is the callback called at the end. 

All normal hooks are called when using these functions. However:

* The `paramIds` array is shortened so that it only has its last element. This means that you are free to query a store without any pre-set automatic filtering imposed by `paramIds`
* All `request.handleXXX` are set to `true`
* The `request.remote` variable is set to false
* Permissions are always granted

When using the API, the `options` object is especially important, as it defines how the API will work.

When a request comes from a remote operation, the `options` object is populated depending on the requested URL and headers. When using the API, you need to popuate `options` manually in order to obtain what you desire. `options` is especially important while querying, as that's where you define what you filter and order the results by.

(If you are curious, when a remote connection is established the function `_initOptionsFromReq()` is the one responsible of getting headers and URL, and populating `options` before running the appropriate function).

* `overwrite` for `Put` requests; (if used as remote store, taken from HTTP headers)
* `filters` for `GetQuery` requests; (if used as remote store, taken from URL)
* `ranges` for `GetQuery` requests; (if used as remote store, taken from HTTP headers)
* `sort` for `GetQuery` requests (if used as remote store, taken from URL)
* `skipHardLimitOnQueries` for `GetQuery` requests (if used as remote store, _always_ false)

When using API functions, can pass directly pass `overwrite`, `sort`, `ranges`, `filters`, `skipHardLimitOnQueries`.

**Note:** When using `GetQuery()` from the API, you are not limited to searching for fields defined in the `onlineSearchSchema` (a limitation that is present for all remote queries for obvious security reasons). When using `GetQuery()` from the API, you can search for any field _either_ in the `schema` _or_ in the `onlineSearchSchema`.

Here is a detailed explanation of these options:

## overwrite

This option applies to Put calls.

* if `options.overwrite` is not set, the `Put` request will happily overwrite an existing record, or create a new one.
* if `options.overwrite` is set:
 * If it's set to `false`, then the module will only allow the creation of new records on the database
 * If it's set to `true`, then the module will only allow overwriting existing records on the database

Example:

    // Will never overwrite an existing workspace
    Workspaces.Put( someId, { workspaceName: "Some workspace name" }, { overwrite: false }, function( res, err ){

For non-API calls, this option is set by the headers 'if-match' and 'if-none-match'.

# delete

This options applies to GetQuery calls.

If `delete` is set to true, then the fetched records will be deleted after fetching. Whatever is returned by GetQuery will no longer be available on the database.

The deletion is more of an "attempt" to delete them. If deletion fails, GetQuery will still return the fetched values and deletion will fail silently.

If `delete` is not passed, then the store's default, set by `deleteAfterGetQuery`, will be used.

## filters

This option applies to GetQuery calls.

It's a simple object, where the keys are the field names, and their respective values are the filters. For example:

    { workspaceName: "Booker" }

A typical example could be:

    Workspaces.GetQuery( { conditions: { workspaceName: 'Booker'} }, function( err, doc ) {
    })

For non-API calls, this option is set by the query string in the URL.

## ranges

This option applies to GetQuery calls.

Ranges are important as they allow you to define a limit on the number of records returned.

It represents an objects with the keys `rangeFrom`, `rangeTo`, `limit`. E.g.:

    // Will return records with workspaceName starting with "Boo" 
    Workspaces.GetQuery( { 
      conditions: { workspaceNameStartsWith: 'Boo' }, 
      ranges: { from: 0, to: 24 }
    } , function( err, doc ) {
      // ...
    });

For non-API calls, ranges are set by the 'range' headers. For example `Range: items=0-24`. Note that the server will also return, after a range query, a header that will detail the range returned. For example `Content-Range: items 0-24/66`

## sort

This option applies to GetQuery calls.

This option is an object where each key is the key you want to sort by, and that key's value is either `1` (ascending order) or `-1` (descending order).

For example:

    // Will return records with workspaceName starting with "Boo" and workGroup equals to "Full match"
    Workspaces.GetQuery( {
      conditions: { workspaceNameStartsWith: 'Boo' },
      sort: { workspaceName: 1, score: -1 },
    } , function( err, doc ) {
      // ...
    });

For non-API calls, this option is set by the query string in the URL. E.g. `/workspaces/?workspaceName=something&sortBy=+workspaceName,-score`.

## skipHardLimitOnQueries

This option applies to GetQuery calls.

If set to `true`, then the `hardLimitOnQueries` will be ignored. Use with care: returning large number of records will result in memory hogging.

# Behind the scenes

Understanding what happens behind the scenes is important to understand how the library works.
This is the list of functions that actually do the work behind the scenes:

 * `_makeGet()` (implements GET for one single document)
 * `_makeGetQuery()` (implements GET for a collection, no ID passed)
 * `_makePut()` (implements PUT for a collection)
 * `_makePost()` (implements POST for a collection)
 * `_makeDelete()` (implements DELETE for a collection)

When you write:

    Workspaces.onlineAll( app )

and the class has a `publicURL` set as `/workspaces/:id`, you are actually running:

    // Make entries in "app", so that the application
    // will give the right responses
    app.get(      url + idName, Store.online.Get( Class ) );
    app.get(      url,          Store.online.GetQuery( Class ) );
    app.put(      url + idName, Store.online.Put( Class ) );
    app.post(     url,          Store.online.Post( Class ) );
    app.delete(   url + idName, Store.online.Delete( Class ) );

Where `url` is `/workspaces/` and `idName` is `:id`.

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
      request._makePut( request, next );

    }

Basically, an object of type `Workspaces` is created. The `request` variable is an object able to perform exactly one operation -- which is exactly what will happen.

After that, the object variables `remote`, `_req` and `_res` are set. `remote` will be used by the object methods to determine how to return their results. `_req` and `_res` are set as they will be important for `remote` requests.

At that point, `req.params` and `req.body` are cloned into two variables with the same names.

Then, something interesting happens: the function `_initOptionsFromReq()` is run. `_initOptionsFromReq()` basically analyses the request and returns the right `options` depending on browser headers. For example, the `overwrite` attribute will depend on the browser headers `if-match` and `if-none-match` (for `Put`) whereas `sort `, `ranges` and `filters` will be set depending on the requested URL (for `GetQuery`).

Finally, `request._makePut()` is run, passing it `params`, `body`, `options` and `next`. `request._makePut()` is where the real magic actually happens: it will run the correct hooks, eventually performing the requested `PUT`.

# What happens exactly in each request

It's important to understand what happens in each request, so that you know exactly what you know when your hooks are called in the request's life cycle.

JsonRestStores does all of the boring stuff for you -- the kind things that you would write over and over and over again while developing a server store. However, it's important to know "how" the boring stuff is done.

(When you read these, think about all of the boring work JsonRestStores is doing for you for every store you define!)

### `_makeGet()` (for `GET` requests, with ID)

* (ATTR) `self.handleGet` is checked. If false, send `NotImplementedError`
* incoming request.paramIds (:ids from URL) are checked against schema. If fail, send `BadRequestError`
* record is fetched from DB. If fail, send `NotFoundError` -> `fullDoc`
* (HOOK) `self.extrapolateDoc( fullDoc )` is run against the record just fetched -> `doc`
* `doc` is cast against the schema. If fail, send `UnprocessableEntityError`
* (HOOK) `self.checkPermissionsGet( request, doc, fullDoc )` is run. If fail, send `ForbiddenError`
* (HOOK) `self.prepareBeforeSend( request, doc )` is run -> `doc`
* (HOOK) `self.afterGet( request, doc, fullDoc )` is run
* `doc` is sent (status: 200)/returned. Party!

### `_makeGetQuery()` (for GET requests, no ID)

* (ATTR) `self.handleGetQuery` is checked. If false, send `NotImplementedError`
* incoming request.paramIds (:ids from URL) are checked against schema. If fail, send `BadRequestError`
* (HOOK) `self.checkPermissionsGetQuery( request )` is run. If fail, send `ForbiddenError`
* Search terms (from GET data) are cast against the onlineSearchSchema. If fail, send `BadRequestError`
* docs are fetched from DB.
* FOR EACH RECORD -> `queryDocs`
 * (HOOK) `self.extrapolateDoc( fulldoc )` is run against each `fullDoc` -> `doc`
 * Each `doc` is cast against the schema. If ONE fails, everything fails: send `UnprocessableEntityError`
 * (HOOK) `self.prepareBeforeSend( request, doc )` is run
* (HOOK) `self.afterGetQueries( request, queryDocs )` is run
* `queryDocs` is sent as array (status: 200)/returned as array. Party!

### `_makeDelete()` (for DELETE requests)

* (ATTR) `self.handleDelete` is checked. If false, send `NotImplementedError`
* incoming request.paramIds (:ids from URL) are checked against schema. If fail, send `BadRequestError`
* `fullDoc` is fetched from DB. If fail, send `NotFoundError`
* (HOOK) `self.extrapolateDoc( doc )` is run against the record just fetched -> `doc`
* `doc` is cast against the schema. If fail, send `UnprocessableEntityError`
* (HOOK) `self.checkPermissionsDelete( request, doc, fullDoc )` is run. If fail, send `ForbiddenError`
* Record is deleted!
* (HOOK) `self.afterDelete( request, doc, fullDoc )` is run
* Empty result is sent (status: 204)/data is returned. Party!

### `_makePost()` (for POST requests)

* (ATTR) `self.handlePost` is checked. If false, send `NotImplementedError`
* incoming request.paramIds (:ids from URL) are checked against schema. If fail, send `BadRequestError`
* (HOOK) `self.prepareBody( request, body, 'post' )` is run against the record just fetched
* Body is cast against the schema. If fail, send `UnprocessableEntityError`
* (HOOK) `self.afterValidate( request, body, 'post' )` is run against the record just fetched
* (HOOK) `self.checkPermissionsPost( request )` is run. If fail, send `ForbiddenError`
* Body is cleaned up of fields with `doNotSave: true` in schema
* record is written to the DB.
* record is re-fetched from DB -> `fullDoc`
* (HOOK) `self.extrapolateDoc( fullDoc )` is run against the record just fetched -> `doc`
* `doc` is cast against the schema. If fail, send `UnprocessableEntityError`
* Set the `Location:` header
* IF `self.echoAfterPost`:
  * (HOOK) `self.prepareBeforeSend( request, doc )` is run 
  * (HOOK) `self.afterPost( request, doc, fullDoc )` is run
  * `doc` is sent (status: 200)/returned. Party!
* ELSE:
  * (HOOK) `self.afterPost( request, doc, fullDoc )` is run
  * Empty result is sent (status: 200)/data is returned. Party!

### `_makePut()` (for PUT requests)

* (ATTR) `self.handlePut` is checked. If false, send `NotImplementedError`
* incoming request.paramIds (:ids from URL) are checked against schema. If fail, send `BadRequestError`
* (HOOK) `self.prepareBody( request, body, 'put' )` is run against the record just fetched
* Body is cast against the schema. If fail, send `UnprocessableEntityError`
* (HOOK) `self.afterValidate( request, body, 'put' )` is run against the record just fetched
* record is fetched from DB (ATTEMPT) -> `fullDoc`
* `options.overwrite` is checked: if true & record not there, or false and record there, send `PreconditionFailedError`

#### ...and then, for NEW records (fetching failed)

* (HOOK) `self.checkPermissionsPutNew( request )` is run. If fail, send `ForbiddenError`
* `body` is cleaned up of fields with `doNotSave: true` in schema
* record is written to the DB.
* record is re-fetched from DB -> `fullDoc`
* (HOOK) `self.extrapolateDoc( fullDoc )` is run against the record just fetched -> `doc`
* `doc` is cast against the schema. If fail, send `UnprocessableEntityError`
* Set the `Location:` header
* IF `self.echoAfterPut`:
  * (HOOK) `self.prepareBeforeSend( request, doc )` is run
  * (HOOK) `self.afterPutNew( request, doc, fullDoc, options.overwrite )` is run
  * `doc` is sent (status: 200)/returned. Party!
* ELSE:
  * (HOOK) `self.afterPutNew( request, doc, fullDoc, options.overwrite )` is run
  * Empty result is sent (status: 200)/data is returned. Party!

#### ...or then, for EXISTING records (fetching worked)

* (HOOK) `self.extrapolateDoc( fullDoc )` is run against the record just fetched -> `doc`
* `doc` is cast against the schema. If fail, send `UnprocessableEntityError`
* (HOOK) `self.checkPermissionsPutExisting( request, doc, fullDoc )` is run. If fail, send `ForbiddenError`
* `doc` is cleaned up of fields with `doNotSave: true` in schema
* record is updated to the DB.
* record is re-fetched from DB. If fail, send `NotFoundError` -> fullDocAfter
* (HOOK) `self.extrapolateDoc( docAfter )` is run against the record just fetched
* Doc is cast against the schema. If fail, send `UnprocessableEntityError`
* Set the `Location:` header
* IF `self.echoAfterPut`:
  * (HOOK) `self.prepareBeforeSend( request, docAfter )` is run.
  * (HOOK) `self.afterPutExisting( request, doc, fullDoc, docAfter, fullDocAfter, options.overwrite )` is run
  * `docAfter` is sent (status: 200)/returned. Party!
* ELSE:
  * (HOOK) `self.afterPutExisting( request, doc, fullDoc, docAfter, fullDocAfter, options.overwrite )` is run
  * Empty result is sent (status: 200)/data is returned. Party!


