JsonRestStores
==============

JsonRestStores is a one-stop module that allows you to create fully functional, configurable Json REST stores using NodeJS. A store can be inherited from another store, and can define all sorts of hooks to configure how it behaves and what it does (including permissions). It even creates the right indexes for you. It's also very easy to create "nested" stores (`http://www.example.com/bookings/1234/users` for example).

Database access is done using [simpledblayer](https://github.com/mercmobily/simpledblayer), which at the moment supports:

* MongoDb
* TingoDb
* ...more coming soon

It's really simple to develop more layers (e.g. MariaDb, Postgresql, CouchDb, etc.);

And don't worry, after an overly long introduction, I do have a [quickstart](https://github.com/mercmobily/JsonRestStores#quick-start)!

# Introduction to (JSON) REST stores

Here is an introduction on REST, JSON REST, and this module. If you are a veteran of REST stores, you can probably just skim through this.

## Implementing REST stores

Imagine that you have a web application with bookings, and users connected to each booking, and that you want to make this information available via a JSON Rest API. You would have to define the following route in your application:

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

* You need to make sure that permissions are always carefully checked. For example, only users that are part of booking `1234` can `GET /bookings/:bookingId/users`
* You need to make sure you behave correctly in your `PUT` calls, as data might already be there
* When implementing `GET /bookings/`, you need to make sure people can filter and order by the right fields by parsing the URL correctly. When you do that, you need to keep in mind that different parameters will need to trigger different filters on the database (for example, `GET /bookings?dateFrom=1976-01-10&name=Tony` will need to filter, on the database, all bookings made after the 10th of January 1976 by Tony).
* When implementing `GET /bookings/`, you need to return the right `Content-Range` HTTP headers in your results
* When implementing `GET /bookings/`, you also need to make sure you take into account any `Range` header set by the client, who might only want to receive a subset of the data
* With `POST` and `PUT`, you need to make sure that data is validated against some kind of schema, and return the appropriate errors if it's not.
* With `PUT`, you need to consider the HTTP headersd `If-match` and `If-none-match` to see if you can/should/must overwrite existing records
* You must remember to get your filters right: when implementing `GET /bookings/:bookingId/users/:userId`, you must make sure that you are making queries to the database without forgetting `:bookingId`. This sounds pretty obvious with only 2 stores, gets tricky when you have a few dozens.
* Don't forget about URL format validation: you need to make sure that anything submitted by the user is sanitised etc.
* You need to create database indexes the right way, so that searches are not slow.

This is only a short list of obvious things. There are many more to consider.

With JsonRestStores, you can create JSON REST stores without ever worrying about any one of those things. You can concentrate on what _really_ matters: your application and your application's logic.

## Understand a little about REST stores

If you are new to REST and web stores, you will probably benefit by reading a couple of important articles. Understanding the concepts behind REST stores will make your life easier.

I suggest you read [John Calcote's article about REST, PUT, POST, etc.](http://jcalcote.wordpress.com/2008/10/16/put-or-post-the-rest-of-the-story/). (It's a fantastic read, and I realised that it was written by John, who is a long term colleague and friend, only much later!).

You should also read my small summary of [what a REST store actually provides](https://github.com/mercmobily/JsonRestStores/blob/master/jsonrest.md).

To understand stores and client interaction, you can read [Dojo's JsonRest stores documentation](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html), because the stores created using this module are 100% compliant with what Dojo's basic JsonRest module sends to servers.

## JsonRestStores' features

* Follows the KISS principle: everything is kept as simple as possible.
* 100% compliant with [Dojo's JsonRest stores](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html). This means for example that the server will handle the `if-match` and `if-none-match` headers (for `PUT` calls), or will take into consideration the `range` headers and provide the right `Content-range` header in the responses (for `GET` calls) and so on.
* It's database-agnostic. It uses simpledblayer to access data, and it can also manipulate subsets of existing data.
* It uses a simple schema library  simple, extendible data validation. 
* It uses OOP patterns neatly using simpledeclare: each store is a javascript constructor which inherits from the database-specific constructor (which inherits itself from a generic, base constructor).
* All unimplemented methods will return a `501 Unimplemented Method` server response
* It's able to manipulate only a subset of your DB data. If you have existing tables/collections, JsonRestStores will only ever touch the fields defined in your store's schema.
* It will use SimpleDbLayer, which will create indexes according to what's marked as `searchable` in the schema; this includes creating compound keys with the store's IDs as prefix when possible/appropriate
* It's highly addictive. You will never want to write an API call by hand again.

# Quickstart

Jsonreststores is a module that creates managed routes for you, and integrates very easily with existing ExpressJS applications.

## Modules used by JsonRestStores

Here is a list of modules used by JsonRestStores. You should be at least slightly familiar with them.

* [SimpleDeclare - Github](https://github.com/mercmobily/SimpleDeclare). This module makes creation of constructor functions/classes a breeze. Using SimpleDeclare is a must when using JsonRestStores -- unless you want to drown in unreadable code

* [simpledblayer](https://github.com/mercmobily/simpledblayer). This module provides a constructor function what will act as the DB layer for JsonRestStores. Any DB supported by simpledblayer will work with JsonRestStores.

* [SimpleSchema - Github](https://github.com/mercmobily/SimpleSchema). This module makes it easy (and I mean, really easy) to define a schema and validate/cast data against it. It's really simple to extend a schema as well. It's a no-fuss module.

* [Allhttperrors](https://npmjs.org/package/allhttperrors). A simple module that creats `Error` objects for all of the possible HTTP statuses.

Note that all of these modules are fully unit-tested, and are written and maintained by me.

## Using JsonRestStores in your ExpressJS app

In order to use JsonRestStores with MongoDb for example you will need to:

* Create a database connection
* Extend SimpleDbLayer with database-specific functionalities
* Extend SimpleSchema with database-specific functionalities (so that it can deal with the DB's id fields, for example)
* Create stores and get JsonRestStores to set routes in your `app` variable

The first three points are very much db-specific, whereas the last one would stay the same regardless of the database picked. The best thing to do is to enapsulate all of the db-specific functionality in their own module.

Here is how you would change a stock `app.js` file if you used MongoDb:

    /**
     * Module dependencies.
     */

    var express = require('express');
    var routes = require('./routes');
    var user = require('./routes/user');
    var http = require('http');
    var path = require('path');

    var dbSpecific = require('./dbSpecific-mongo.js'); // ADDED
    var storesRoutes = require('./storesRoutes.js'); // ADDED
   
    var app = express();
    
    // ADDED 8 lines:
    // The whole app will be wrapped around the connecton
    dbSpecific.connect( 'mongodb://localhost/tests', {}, function( err ){
      if( err ){
        console.error("Could not connect to the database server");
        process.exit(1);
      } else {
        // From this point on, dbConnect.db will be available to anybody
        // requiring `dbConnect.js`

        // all environments
        app.set('port', process.env.PORT || 3000);
        app.set('views', __dirname + '/views');
        app.set('view engine', 'jade');
        app.use(express.favicon());
        app.use(express.logger('dev'));
        app.use(express.bodyParser());
        app.use(express.methodOverride());
        app.use(app.router);
        app.use(express.static(path.join(__dirname, 'public')));
    
        // Set JsonRestStore routes for REST stores
        storesRoutes( app ); // ADDED
    
        // development only
        if ('development' == app.get('env')) {
          app.use(express.errorHandler());
        } 

        app.get('/', routes.index);
        app.get('/users', user.list);

        http.createServer(app).listen(app.get('port'), function(){
          console.log('Express server listening on port ' + app.get('port'));
        });
      }
    });

Your `dbSpecific-mongo.js` file would look like this:

    // Generic modules
    var declare = require('simpledeclare'); // Declare module
    var JsonRestStores = require('jsonreststores'); // The main JsonRestStores module
    var SimpleSchema = require('simpleschema');  // The main schema module
    var SimpleDbLayer = require('simpledblayer'); // The main DB layer module

    // Mongo-specific modules
    var mongo = require("mongodb"); // MongoDB
    var SimpleSchemaMongo = require('simpleschema-mongo'); // Mongo-specific functions for the schema module
    var SimpleDbLayerMongo = require('simpledblayer-mongo'); // Mongo-specific functions for the DB layer
    
    exports.db = null
    exports.DbLayer = null;
    exports.Schema = null;
    exports.JRS = null;

    exports.connect = function( url, options, cb ){
      mongo.MongoClient.connect( url, options, function( err, db ){
        if( err ){
          cb( err );
        } else {
          exports.db = db;
          exports.Schema = declare( [ SimpleSchema, SimpleSchemaMongo ] );
          exports.DbLayer = declare( [ SimpleDbLayer, SimpleDbLayerMongo ], { db: db } );
          exports.JRS = declare( JsonRestStores, { DbLayer: exports.DbLayer } );

          cb( null );
        }
      });
    }    


It's basically just a module that exports all of the db-specific constructor, and a `connect()` function that will assign something meaningul to those variable.

* `JsonRestStores` need a DbLayer to work. The DbLayer is the `SimpleDbLayer` class, extended with the MongoDB-specific `SimpleDbLayerMongo` class (which will allow it to _acutally_ access the MongoDB database)
* `JsonRestStores` stores are always defined with a Schema. The `SimpleSchema` class is extended with the MongoDB-specific `SimpleSchemaMongo` class (which allows it to understand and cast Mongo's ID fields property)

Your `storesRoutes.js` file will then use `dbSpecific-mongo.js` to get the those variables:

    var declare = require('simpledeclare'); // Declare module

    var dbSpecific = require('./dbSpecific-tingo.js');

    exports = module.exports = function( app ){

      var JRS = dbSpecific.JRS;
      var Schema = dbSpecific.Schema;
    
      var Managers = declare( JRS, {
    
        schema: new Schema({
          name   : { type: 'string', trim: 60 },
          surname: { type: 'string', trim: 60 },
        }),
    
        storeName: 'managers',
        publicURL: '/manages/:id',
    
        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,
    
        hardLimitOnQueries: 50,
      });
    
      Managers.onlineAll( app );
    }

## TingoDB

What if you want to use TingoDB instead? since everything is encapsulated, all you need to do is write `dbSpecific-tingo.js`, as follows:

    // Generic modules
    var declare = require('simpledeclare'); // Declare module
    var JsonRestStores = require('jsonreststores'); // The main JsonRestStores module
    var SimpleSchema = require('simpleschema');  // The main schema module
    var SimpleDbLayer = require('simpledblayer'); // The main DB layer module

    // Tingo-specific modules
    var tingo = require("tingodb")({}); // TingoDB
    var SimpleSchemaTingo = require('simpleschema-tingo'); // Tingo-specific functions for the schema module
    var SimpleDbLayerTingo = require('simpledblayer-tingo'); // Tingo-specific functions for the DB layer
    
    exports.db = null
    exports.DbLayer = null;
    exports.Schema = null;
    exports.JRS = null;

    exports.connect = function( url, options, cb ){
      try {
        exports.db = new tingo.Db(url, options );
      } catch( e ){
        return cb( e );
      }
      exports.Schema = declare( [ SimpleSchema, SimpleSchemaTingo ] );
      exports.DbLayer = declare( [ SimpleDbLayer, SimpleDbLayerTingo ], { db: exports.db } );
      exports.JRS = declare( JsonRestStores, { DbLayer: exports.DbLayer } );

      cb( null );
    }    

At this point you are nearly good to go; you only need some minor modifications:

* In `storesRoutes.js` and `app.js`, change `require('./dbSpecific-mongo.js');` into `require('./dbSpecific-tingo.js');`
* In `app.js`, change the connection string into `dbSpecific.connect( '/tmp/tests', {}, function( err ){`

In the rest of the documentation, I will assume that your `db`, `JRS` and `Schema` variables are set and will focus on the code that actually creates the stores.

# Store examples

Here are three very common use-cases for JsonRest stores, fully explained: 

## A basic store

Here is how you make a fully compliant store:

      var Managers = declare( JRS, {

        schema: new Schema({
          name   : { type: 'string', trim: 60 },
          surname: { type: 'string', trim: 60 },
        }),

        storeName: 'Managers',
        publicURL: '/managers/:id',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        hardLimitOnQueries: 50,
      });

      Managers.onlineAll( app );
 

That's it: this is enough to make a full store which will handly properly all of the HTTP calls. Try it if you don't believe me!

* `Managers` is a new class that inherits from `JRS`. Creating the derived class is the first step towards creating a store
* `schema` (_mandatory_) is an object of type Schema. 
* `publicURL` is the URL the store is reachable at. ***The last one ID is the most important one***: the last ID in `publicURL` (in this case it's also the only one: `id`) defines which field, within your schema, will be used as _the_ record ID when performing a PUT and a GET (both of which require a specific ID to function).
* `storeName` (_mandatory_) needs to be a unique name for your store. It is mandatory to have one, as (when used with a database) it will define the name of the DB table/collection
* `handleXXX` are attributes which will define how your store will behave. If you have `handlePut: false` and a client tries to PUT, they will receive an `NotImplemented` HTTP error
* `Managers.onlineAll()` creates the right Express routes to actually activate your stores. Specifically:

.

    // get (specific ID)
    app.get(    url + idName,  function( req, res, next ){ /* ... */ } );
    // getQuery (array of objects, no ID)
    app.get(    url,          function( req, res, next ){ /* ... */ } );
    // put (specific ID)
    app.put(    url + idName, function( req, res, next ){ /* ... */ } );
    // post (new record, no ID)
    app.post(   url,          function( req, res, next ){ /* ... */ } );
    // delete (specific ID)
    app.delete( url + idName, function( req, res, next ){ /* ... */ } );

So, the following routes will be defined:

    GET /managers/:id (returns a specific workspace)
    GET /managers/ (returns a collection of elements)
    PUT /managers/:id (writes over an existing workspace object)
    POST /managers/ (creates a new workspace object)
    DELETE /managers/:id (deletes a workspace)

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

    $ curl -i -GET"  http://localhost:3000/managers/
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

## A note on `onlineAll` and `paramIds`

When you define a store like this:

      var Managers = declare( JRS, {

        schema: new Schema({
          name   : { type: 'string', trim: 60 },
          surname: { type: 'string', trim: 60 },
        }),

        storeName: 'Managers',
        publicURL: '/managers/:id',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        hardLimitOnQueries: 50,
      });

      Managers.onlineAll( app );

The `publicURL` is used to:

* Add `id: { type: id }` to the schema automatically. This is done so that you don't have to do the grunt work of defining id fields both in `publicURL` and in the schema
* Creates the `paramIds` array for the store. In this case, `paramIds` will be `[ 'id' ]`.

So, you could reach the same goal without `publicURL`:

      var Managers = declare( JRS, {

        schema: new Schema({
          id     : { type: 'id' },
          name   : { type: 'string', trim: 60 },
          surname: { type: 'string', trim: 60 },
        }),

        storeName: 'Managers',
        paramIds: [ 'id' ],

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        hardLimitOnQueries: 50,
      });

      Managers.onlineAll( app, '/managers/:id' );

Note that:
 * The `id` parameter had to be defined in the schema
 * The `paramIds` array had to be defined by hand
 * `Managers.onlineAll()` had to be passed the URL explicitely.

This pattern is much more verbose, it repeats information in three spots (!), and should obviously be avoided. However, it has its place when you want to define generic base classes without a `publicURL`.

In the documentation, I will often refers to `paramIds`, which is an array of element in the schema which match the ones in the route. However, in all examples I will use the "shortened" version without repeating IDs unnecessarily.

Note that you can use the `url` parameter in `onlineAll()` to force the stores' URLs to something different than `publicURL`.

## A nested store

Stores are never "flat" as such: you have workspaces, and then you have users who "belong" to a workspace. Here is how you create a "nested" store:

      var Managers= declare( JRS, {

        schema: new Schema({
          name   : { type: 'string', trim: 60 },
          surname: { type: 'string', trim: 60 },
        }),

        storeName: 'Managers',
        publicURL: '/managers/:id',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        hardLimitOnQueries: 50,
      });


      var ManagersCars = declare( JRS, {

        schema: new Schema({
          make     : { type: 'string', trim: 60, required: true },
          model    : { type: 'string', trim: 60, required: true },
        }),

        storeName: 'ManagersCars',
        publicURL: '/managers/:managerId/cars/:id',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        hardLimitOnQueries: 50,
      });

      ManagersCars.onlineAll( app );
 

You have two stores: one is the simple `Managers` store with a list of names and surname; the other one is the `ManagersCars` store: note how the URL for `ManagersCars` includes `managerId`.

The ManagersCars store will will respond to `GET /managers/2222/cars/3333` (to fetch car 3333 of manager 2222), `GET /workspace/2222/users` (to get all cars of manager 2222), and so on.

Remember that in `ManagersCars`:

* Queries will _always_ honour the filter on `managerId`, both in queries and single-record operations.

### On naming conventions

It's important to be consistent in naming conventions while creating stores. In this case, code is cleared than a thousand bullet points:

#### Simple stores

    var Managers = declare( JRS, { 

      schema: new Schema({
        // ...
      });

      // ...
      storeName: `Managers`
      // ...
    }
    Managers.onlineAll( app );



    var People = declare( JRS, { 

      schema: new Schema({
        // ...
      });

      // ...
      storeName: `People`
      // ...
    }
    People.onlineAll( app );

* Store name is plural
* Irregulars (Person => People) is a fact of life
* Store name variable in capital letters (it's a constructor)
* storeName attribute in capital letters (follows the store name)
* URL in small letters (Capitalised/Urls/Are/Lame)

#### Nested stores    

    var Cars = declare( JRS, { 

      schema: new Schema({
        // ...
      });

      // ...
      storeName: `managers`
      // ...
    }
    Cars.onlineAll( app );


    var ManagersCars = declare( Store, { 

      schema: new Schema({
        // ...
      });

      // ...
      storeName: `ManagerCars`
      // ...
    }
    ManagersCars.onlineAll( app );

    var PeopleCars = declare( Store, { 

      schema: new Schema({
        // ...
      });
 
      // ...
      storeName: `PeopleCars`
      // ...
    }
    PeopleCars.onlineAll( app );

* Nested store's name a combination of IDs
* storeName attribute still the same as the store name
* URL in small letters, starting with URL of parent store
* parent store's ID in schema first, singular

## A store derived/inherited from another store

Sometimes, you need to create a basic store that interfaces with a specific database table/collection, and then create different ways to "view" that table as a store.

    var PeopleCars = declare( Store, { 

      schema: new Schema({
        // ...
      });
 
      // ...
      storeName: `PeopleCars`
      publicURL: '/people/:personId/cars/:id',

      handleGet: true,
      handleGetQuery: true,
      handlePut: true
      // ...
    }
    PeopleCars.onlineAll( app );

    var PeopleCarsList = declare( PeopleCars, { 
      handleGet: false,
      handlePut: false 
      publicURL: '/people/:personId/carsList/:id',
    }
    PeopleCarsList.onlineAll( app );


The store PeopleCarsList is nearly exactly the same as PeopleCars: the only difference is that it doesn't allow anything except GetQuery (that is, `GET /people/1234/carslist/` ).

You might even create a basic store _without_ running `onlineAll()` for it, and then derive several stores from it, each with a slightly different URL and (most likely) different permissions.

# Artificial delays

When testing the application locally, everything is fast and zippy. However, stores don't tend to behave like that in real life. If your application implements things like drag&drop, form saving, etc, you often want to see how it behaves in "real life" -- in a situation where responses can take anything between 1 and 8 seconds.

In order for force JsonRestStores to add an artificial delay to _every_ online request (it won't apply to API), just assign a value to JsonRestStores.artificialDelay, like this:

    var JsonRestStores = require('jsonreststores');
    JsonRestStores.artificialDelay = 8000;

This will apply to _every_ online request, which will be delayed by 8 seconds.

# Reposition and before

Both `PUT` and `POST` calls will check for headers to see if an item is being repositioned:

* `X-rest-before`. If set, the item will be placed _before_ the one with the ID corresponding to the header value.
* `X-rest-reposition`. If set, JsonRestStore will actually ignore the data, and will simply reposition the item as it was. This is useful if you want your client to trigger a reposition without re-submitting (useless) data to the server.

Note that the way items are repositioned is beyond the scope of JsonRestStores, which calls the DB layer's `position()` function. All you have to do to allow repositioning is pass the store `position: true`:

      var Managers= declare( JRS, {

        schema: new Schema({
          name   : { type: 'string', trim: 60 },
          surname: { type: 'string', trim: 60 },
        }),

        position: true,

        storeName: 'Managers',
        publicURL: '/managers/:id',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        hardLimitOnQueries: 50,
      });

Note that:

* The position field is not exposed in any way. In fact, the way it's implemented by the DB layer is irrelevant to JsonRestStores
* JsoNRestStores will return items in the right order when no sorting option is provided

# Important methods and attributes you can override

The basic `Store` class uses a rather long list of stock methods to complete requests. Some of them are there so that you can override them.

## Data manipulation

### `extrapolateDoc()`

In the documentation and the code, you will often see that two versions of the object are passed: `doc` and `fullDoc`. This is because JsonRestStores allows you to define a method, `extrapolateDoc()`, which will extrapolate the information you actually want to read. Basically, `extrapolateDoc()` is run every time a record is fetched from the database.

You can use this method to manipulate your data every time it's fetched from the database. However, the resulting data _must still conform with the schema after manipulation _, or JsonRestStore will get into an error.

Note that permission functions have both `doc` and `fullDoc` so that they can easily make an "informed" decision on granting or denying access regardless of how the data was manipulated by `extrapolateDoc()`.

The method's signature is:

    extrapolateDoc( params, body, options, fullDoc, cb( err, doc ) )`

It's important that you create a copy of `fullDoc` rather than changing it directly. E.g.:

...this is wrong:
    
    extrapolateDoc: function( params, body, options, fullDoc, cb){
      // WRONG!!! This will effectively change fullDoc, which IS a side-effect
      doc = fullDoc;
      doc.name = doc.name.toUpperCase();
      cb( null, name );
    }

...this is correct:

    extrapolateDoc: function( params, body, options, fullDoc, cb){
      // CORRECT! This will create a copy of fullDoc, and THEN manipulate it
      var doc = {};
      for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
      doc.name = doc.name.toUpperCase();
      cb( null, name );
    }


### `prepareBeforeSend( doc, cb )`(

The method `prepareBeforeSend()` does exactly what it says: it will manipulate `doc` just before it's sent over to the client who requested it. This is especialy useful if you want to apply last minute changes to the data you send.

An important difference between `prepareBeforeSend()` and `extrapolateDoc()` is that the data in `prepareBeforeSend()` does __not__ have to conform to the schema at all. This is the right time to add _anything_ you want to it without worrying about breaking the schema.

The method's signature is:

    prepareBeforeSend( doc, cb )


## Indexing functions

The only indexing function available is:

* `generateStoreAndSchemaIndexes( options, cb )` -- The name speaks for itself. `options` can have `background: true` if you want the operation to run in the background

This function will run SimpleDbLayer's generateSchemaIndexes(), as well as adding store-specific indexes:

* Will create an index with all `idParams`
* Will create a new index for each searchable field, in the form `workspaceId + searchableField` since most searches will be run by users within their `workspaceId` domain
* Will create a compound index with `paramIds + field` for each `sortable` field

## Queries

### `deleteAfterGetQuery`

If set to `true`, any "get query" method will have the side effect of deleting the fetched records from the database. Whatever is set here will be used as the default for `GetQuery` calls from the API.

### `hardLimitOnQueries`

This is the limit of the number of elements that can be returned by a query without ID (GetQuery). The default is 50. 
## Permissions

By default, everything is allowed: stores allow pretty much anything and anything; anybody can DELETE, PUT, POST, etc. Furtunately, JsonRestStores allows you to decide exactly what is allowed and what isn't, by overriding specific methods.

Each permission function needs to call the callback: if everything went fine, `cb()` will be called with `cb( null, true )`; to fail, `cb( null, false )`.

Here are the functions:

 * `checkPermissionsPost( params, body, options, cb )` 
 * `checkPermissionsPutNew( params, body, options, cb )`
 * `checkPermissionsPutExisting( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsGet( params, body, options, doc, fullDoc, cb )`
 * `checkPermissionsGetQuery( params, body, options, cb )`
 * `checkPermissionsDelete( params, body, options, doc, fullDoc, cb )`

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
      
      checkPermissionsDelete: function( params, body, options, doc, fullDoc, cb ){

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

      checkPermissionsDelete: function( params, body, options, doc, fullDoc, cb ){

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


## "Prepare Body" and "after postValidate" hooks

These hooks are there so that you can manpulate the data passed to your store both _before_ it's validated against the schema, and _after_ it's been validated.

When data is submitted to the store, sometimes you want to manipulate it *before* it gets validated against the schema. For example, your application might pass extra parameters (which are not part of the schema) that will influence the actual schema fields. Or, you might want to manipulate the passed data _after_ validation (which is useful if you want to make absolute sure that all the fields are cast and valid).

* `prepareBody( body, method, cb )`
* `postValidate( body, method, cb )`

In both hooks, `method` can be either `"put"` or `"post"`.

`prepareBody()` is called with the data passed from the client _as is_ (no casting, nor anything). Any manipolation done by prepareBody will need to satisfy the schema, or validation will actually fail. This hook is useful if you want to force some fields to specific values, maybe depending on a session variable for the specific user. For example, when a record is created, you will have `creatorId` in the schema, but you won't want users to be able to specify any ID there. So, you can simply assign body.creatorId in the `prepareBody()` hook.

`postValidate()` is called once validation is completed. This hook is especially useful if you want to make some cross-check on other stores (for example that IDs are correct, etc.); since everything is cast and validated, all IDs are already of the right type.

## "After" hooks

These functions are handy where, in your own applications, you want "something" to happen after one of those operations is complete.

You can redefine them as you wish.

 * `afterPutNew( params, body, options, doc, fullDoc, overwrite, cb )` (Called after a new record is PUT)
 * `afterPutExisting( params, body, options, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb )` (After a record is overwritten with PUT)
 * `afterPost( params, body, options, doc, fullDoc, cb )` (After a new record is POSTed)
 * `afterDelete( params, body, options, doc, fullDoc, cb )` (After a record is deleted)
 * `afterGet( params, body, options, doc, fullDoc, cb  )` (After a record is retrieved)

Note that these hooks are run **after** data has been written to the database, but **before** a response is provided to the user.

# Searching in queries

`GetQuery` is the only method that allows searches, and that returns an array of objects (rather than a specific one). `GetQuery` is called whenever the route is called without specifying the object ID in the URL. So, if `GET /users/1` will return the JSON representation of the user with `id` `1`, `GET /users` will return an array of all users that satisfy the filter specified in the `GET` request (in this case, there is no filter).

## Searchable fields

When querying a store you are able to specify a list of field/value pairs via URL.
A typical URL would be:

    GET /people?name=tony&surname=mobily

JsonRestStores allows you to decide how to query the database depending on what was passed by the user. For example, a basic usage would be:

      var People = declare( Store, {

        schema: new Schema({
          name   : { type: 'string', trim: 20, searchable: true },
          surname: { type: 'string', trim: 20, searchable: true },
        }),

        storeName: 'People',
        publicURL: '/people/:id',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

      });

      // Create the right hooks to access the store
      People.onlineAll( app );

So, for a query like `GET /people?name=tony&surname=mobily`, only records where `name` _and_ `surname` match will be returned as an array.

You can decide to apply a different type of filter by defining `searchableOptions` for that field:

        schema: new Schema({
          name   : { type: 'string', trim: 20, searchable: true, searchOptions: { type: 'eq' } },
          surname: { type: 'string', trim: 20, searchable: true, searchOptions: { type: 'startsWith' } },
        }),

In such a case, the request `GET /people?name=tony&surname=mob` will return all records where `name` is `Tony`, and surname starts with `mob`. ere, `type` can be any one condition allowed in simpledblayer: `is` `eq` `lt` `lte` `gt` `gte` `startWith` `startsWith` `contain` `contains` `endsWith` `endWith`.

## `and` and `or` in queries

You can decide if you want to apply `or` or `and` when filter searchable fields by setting the `condition` attribute in `searchable`. For example:

        schema: new Schema({
          age    : { type: 'number', max: 130, searchable: true, searchOptions: { type: 'eq' },
          name   : { type: 'string', trim: 20, searchable: true, searchOptions: { type: 'startsWith', condition: 'or' } },
          surname: { type: 'string', trim: 20, searchable: true, searchOptions: { type: 'startsWith', condition: 'or' } },
        }),

In such a case, _the `or` conditions will be grouped together_; so, the request `GET /people?age=37&name=ton&surname=mob` will return all records where `age` is `37`, and then _either_ the name starts with `ton`, _or_ the surname starts with `mob`.  This is probably an uncommon scenario, but there might be cases where `or` is actually useful.

## Search schema

Specifying `searchable` straight into the schema limits you to decide how each field will be searched; so, there is a 1:1 correspondence between a field and how it's searched.

To overcome this limitation, JsonRestStores allows you to define an additional schema, called `onlineSearchSchema`, which gives you a lot more power.

Consider this example:

      var People = declare( Store, {

        schema: new Schema({
          name   : { type: 'string', trim: 20 },
          surname: { type: 'string', trim: 20 },
        }),

        onlineSearchSchema: new Schema({
          name             : { type: 'string', trim: 20, searchable: true, searchOptions: { type: 'is' } },
          surname          : { type: 'string', trim: 20, searchable: true, searchOptions: { type: 'is' } },
          nameContains     : { type: 'string', trim: 4, searchable: true, searchOptions: { type: 'contains',   field: 'name' } },
          surnameContains  : { type: 'string', trim: 4, searchable: true, searchOptions: { type: 'contains',   field: 'surname' } },
          surnameStartsWith: { type: 'string', trim: 4, searchable: true, searchOptions: { type: 'startsWith', field: 'surname' } },
          nameOrSurnameStartsWith: { type: 'string', trim: 4, searchable: true, searchOptions: [ { field: 'surname', type: 'startsWith', condition: 'or' }, { field: 'name', type: 'startsWith', condition: 'or' } ] },
        }),

        storeName: 'People',
        publicURL: '/people/:id',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,
      });

      // Create the right hooks to access the store
      People.onlineAll( app );


This is neat! Basically, you are still bound to the limitations of HTTP GET requests (you can only specify a bunch of key/values in th GET); but, you can easily decide how each key/value pair will affect your search. For example, requesting `GET /people?nameContains=ony&surname=mobily` will match all records where the name _contains_ `ony` and the surname _is_ `mobily`.

This is achieved thanks to the `field` attribute in `searchOptions`, which allows you to specify which field the filter will apply to.

Note that you can pass an array of options to `searchOptions` (see `nameOrSurnameStartsWith`). In this case, all conditions will be applied.

### Schema and search schema: security

Note that when a store is queried, only fields marked as `searchable` in the schema will actually be searchable. If a `onlineSearchSchema` is provided, only fields in the `onlineSearchSchema` will actually be searchable.

It's advisable to define a `onlineSearchSchema` for every store in a production site, so that you have full control of what is searchable by remote calls.

## Schema attribute `sortable`

If a field is marked as `searchable`, then it may or may not be sortable too. This is what a URL will look like:

    /workspaces/?workspaceName=something&sortBy=+workspaceName,-workGroup

The field `sorBy` is interpreted by the GetQuery function: it's a list of comma-separated fields, each one starting with a `+` or with a `-`. If those fields are marked as `sortable` in the schema, then they will be sorted accordingly.

***NOTE TO DOJO USERS***: while using these stores with Dojo, you will _need_ to define them like so: `var store = new JsonRest( { target: "/workspaces/", sortParam: "sortBy" });`. The `sortParam` element is mandatory, as it needs to be `sortBy`. At this stage, JsonRestStores is _not_ able to interpret correctly URLs such as `/workspaces/?workspaceName=something&sort(+workspaceName,-workgroup)` (which is what Dojo will request if you do not specify `sortParam`).

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

When querying from the API, can pass `overwrite`, `sort`, `ranges`, `filters`.

When using `GetQuery()` from the API, you are not limited to searching for fields defined in the `onlineSearchSchema` (a limitation that is present for all remote queries for obvious security reasons). When using `GetQuery()` from the API, you can search for any field _either_ in the `schema` _or_ in the `onlineSearchSchema`.

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

# filters

This option applies to GetQuery calls.

It's a simple object, where the keys are the field names, and their respective values are the filters. For example:

    { workspaceName: "Booker" }

A typical example could be:

    Workspaces.GetQuery( { filters: { workspaceName: 'Booker'} }, function( err, doc ) {
    })

For non-API calls, this option is set by the query string in the URL.

## ranges

Ranges are important as they allow you to define a limit on the number of records returned.

It represents an objects with the keys `rangeFrom`, `rangeTo`, `limit`. E.g.:

    // Will return records with workspaceName starting with "Boo" 
    Workspaces.GetQuery( { 
      filters: { workspaceNameStartsWith: 'Boo' }, 
      ranges: { from: 0, to: 24 }
    } , function( err, doc ) {
      // ...
    });

For non-API calls, ranges are set by the 'range' headers. For example `Range: items=0-24`. Note that the server will also return, after a range query, a header that will detail the range returned. For example `Content-Range: items 0-24/66`

## sort

This option is an object where each key is the key you want to sort by, and that key's value is either `1` (ascending order) or `-1` (descending order).

For example:

    // Will return records with workspaceName starting with "Boo" and workGroup equals to "Full match"
    Workspaces.GetQuery( {
      filters: { workspaceNameStartsWith: 'Boo' },
      sort: { workspaceName: 1, score: -1 },
    } , function( err, doc ) {
      // ...
    });

For non-API calls, this option is set by the query string in the URL. E.g. `/workspaces/?workspaceName=something&sortBy=+workspaceName,-score`.

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
      request._makePut( params, body, options, next );

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
* incoming paramIds (:ids from URL) are checked against schema. If fail, send `BadRequestError`
* record is fetched from DB. If fail, send `NotFoundError` -> `fullDoc`
* (HOOK) `self.extrapolateDoc( fullDoc )` is run against the record just fetched -> `doc`
* `doc` is cast against the schema. If fail, send `UnprocessableEntityError`
* (HOOK) `self.checkPermissionsGet( params, body, options, doc, fullDoc )` is run. If fail, send `ForbiddenError`
* (HOOK) `self.prepareBeforeSend( doc )` is run -> `doc`
* (HOOK) `self.afterGet( params, body, options, doc, fullDoc )` is run
* `doc` is sent (status: 200)/returned. Party!

### `_makeGetQuery()` (for GET requests, no ID)

* (ATTR) `self.handleGetQuery` is checked. If false, send `NotImplementedError`
* incoming paramIds (:ids from URL) are checked against schema. If fail, send `BadRequestError`
* (HOOK) `self.checkPermissionsGetQuery( params, body, options )` is run. If fail, send `ForbiddenError`
* Search terms (from GET data) are cast against the onlineSearchSchema. If fail, send `BadRequestError`
* docs are fetched from DB.
* FOR EACH RECORD -> `queryDocs`
 * (HOOK) `self.extrapolateDoc( fulldoc )` is run against each `fullDoc` -> `doc`
 * Each `doc` is cast against the schema. If ONE fails, everything fails: send `UnprocessableEntityError`
 * (HOOK) `self.prepareBeforeSend( doc )` is run -> `doc`
* (HOOK) `self.afterGetQueries( params, body, options, queryDocs )` is run
* `queryDocs` is sent as array (status: 200)/returned as array. Party!

### `_makeDelete()` (for DELETE requests)

* (ATTR) `self.handleDelete` is checked. If false, send `NotImplementedError`
* incoming paramIds (:ids from URL) are checked against schema. If fail, send `BadRequestError`
* `fullDoc` is fetched from DB. If fail, send `NotFoundError`
* (HOOK) `self.extrapolateDoc( doc )` is run against the record just fetched -> `doc`
* `doc` is cast against the schema. If fail, send `UnprocessableEntityError`
* (HOOK) `self.checkPermissionsDelete( params, body, options, doc, fullDoc )` is run. If fail, send `ForbiddenError`
* Record is deleted!
* (HOOK) `self.afterDelete( params, body, options, doc, fullDoc )` is run
* Empty result is sent (status: 204)/data is returned. Party!

### `_makePost()` (for POST requests)

* (ATTR) `self.handlePost` is checked. If false, send `NotImplementedError`
* incoming paramIds (:ids from URL) are checked against schema. If fail, send `BadRequestError`
* (HOOK) `self.prepareBody( body, 'post' )` is run against the record just fetched
* Body is cast against the schema. If fail, send `UnprocessableEntityError`
* (HOOK) `self.postValidate( body, 'post' )` is run against the record just fetched
* (HOOK) `self.checkPermissionsPost( params, body, options )` is run. If fail, send `ForbiddenError`
* Body is cleaned up of fields with `doNotSave: true` in schema
* record is written to the DB.
* record is re-fetched from DB -> `fullDoc`
* (HOOK) `self.extrapolateDoc( fullDoc )` is run against the record just fetched -> `doc`
* `doc` is cast against the schema. If fail, send `UnprocessableEntityError`
* Set the `Location:` header
* IF `self.echoAfterPost`:
  * (HOOK) `self.prepareBeforeSend( doc )` is run -> `doc`
  * (HOOK) `self.afterPost( params, body, options, doc, fullDoc )` is run
  * `doc` is sent (status: 200)/returned. Party!
* ELSE:
  * (HOOK) `self.afterPost( params, body, options, doc, fullDoc )` is run
  * Empty result is sent (status: 200)/data is returned. Party!

### `_makePut()` (for PUT requests)

* (ATTR) `self.handlePut` is checked. If false, send `NotImplementedError`
* incoming paramIds (:ids from URL) are checked against schema. If fail, send `BadRequestError`
* (HOOK) `self.prepareBody( body, 'put' )` is run against the record just fetched
* Body is cast against the schema. If fail, send `UnprocessableEntityError`
* (HOOK) `self.postValidate( body, 'put' )` is run against the record just fetched
* record is fetched from DB (ATTEMPT) -> `fullDoc`
* `options.overwrite` is checked: if true & record not there, or false and record there, send `PreconditionFailedError`

#### ...and then, for NEW records (fetching failed)

* (HOOK) `self.checkPermissionsPutNew( params, body, options )` is run. If fail, send `ForbiddenError`
* `body` is cleaned up of fields with `doNotSave: true` in schema
* record is written to the DB.
* record is re-fetched from DB -> `fullDoc`
* (HOOK) `self.extrapolateDoc( fullDoc )` is run against the record just fetched -> `doc`
* `doc` is cast against the schema. If fail, send `UnprocessableEntityError`
* Set the `Location:` header
* IF `self.echoAfterPut`:
  * (HOOK) `self.prepareBeforeSend( doc )` is run -> `doc`
  * (HOOK) `self.afterPutNew( params, body, options, doc, fullDoc, options.overwrite )` is run
  * `doc` is sent (status: 200)/returned. Party!
* ELSE:
  * (HOOK) `self.afterPutNew( params, body, options, doc, fullDoc, options.overwrite )` is run
  * Empty result is sent (status: 200)/data is returned. Party!

#### ...or then, for EXISTING records (fetching worked)

* (HOOK) `self.extrapolateDoc( fullDoc )` is run against the record just fetched -> `doc`
* `doc` is cast against the schema. If fail, send `UnprocessableEntityError`
* (HOOK) `self.checkPermissionsPutExisting( params, body, options, doc, fullDoc )` is run. If fail, send `ForbiddenError`
* `doc` is cleaned up of fields with `doNotSave: true` in schema
* record is updated to the DB.
* record is re-fetched from DB. If fail, send `NotFoundError` -> fullDocAfter
* (HOOK) `self.extrapolateDoc( docAfter )` is run against the record just fetched
* Doc is cast against the schema. If fail, send `UnprocessableEntityError`
* Set the `Location:` header
* IF `self.echoAfterPut`:
  * (HOOK) `self.prepareBeforeSend( docAfter )` is run.
  * (HOOK) `self.afterPutExisting( params, body, options, doc, fullDoc, docAfter, fullDocAfter, options.overwrite )` is run
  * `docAfter` is sent (status: 200)/returned. Party!
* ELSE:
  * (HOOK) `self.afterPutExisting( params, body, options, doc, fullDoc, docAfter, fullDocAfter, options.overwrite )` is run
  * Empty result is sent (status: 200)/data is returned. Party!


