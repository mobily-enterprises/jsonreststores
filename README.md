JsonRestStores
==============

JsonRestStores is the best way to create REST stores that return JSON data.
Rundown of features:

**WARNING: JsonRestStore is now going through a very extensive rewrite (I am now working on improving the underlying db layer, which will change the way you define queries). Do not use this module till this writing is gone**.

PLAN OF ATTACK:
---------------

## BACK TO SimpleDbLayer with Hotplate

 [X] Fix API calls in tests, making that the only tests that fails are the ones for different SimpleDbLayer
 [X] Fix querying in JsonRestStores, KEEPING the current onlineSearchSchema definitions
 [X] Make sure ALL tests pass (!!!) and that SimpleDbLayerMixin actually works
 [X] Update querying API everywhere, in hotplate and bd. Search for `dbLayer.` (db operations) and apiGetQuery (`filters` is now `conditions`), changed hooks 
 [X] Make sure BookingDojo itself works 100%

**MILESTONE 1 COMPLETED: SimpleDbLayer V.2 is fully working, BookingDojo works again!**

## IMPROVE searchSchema

[ ] Make new syntax for searchSchema, allowing any depth of querying, scheleton defined
[ ] Change tests to see if it all works with new querying ability
[ ] Change hotplate to see if it all works with new queries

## MEMORY store

 [ ] Implement sample store for documentation using memory, basic one with no searching nor adding
 [ ] Implement proper memory store with querying, getting querying code from dstore 
 [ ] Make sure tests run using new memory store
 [ ] Try the whole of hotplate running on the memory store

MILESTONE 2 COMPLETED: JsonRestStore has a memory store that works without buggy TingoDB, and hotplate runs on it

## IMPROVE dstore
 [ ] Use new (and tested) memory store code to write querying code for dstore
 [ ] Check that hotplate all works with new filtering, without ever doing a refresh

MILESTONE 3 COMPLETED: JsonRestStores now works AMAZINGLY well with dstores, 

## DOCUMENTING

 [ ] Rewrite bdocumentation for basic JsonRestStores
 [ ] Rewrite documentation with using SimpleDbLayerMixin

## PARTY

 [ ] Party!

MILESTONE 4 COMPLETED: All foundation work is actually finished.


* **DRY approach**. Everything works as you'd expect it to, even though you are free to tweak things.
* **Database-agnostic**. The module itself provides you with _everything_ except the data-manipulation methods, which are up to you to implement.
* **Schema based**. Anything coming from the client will be validated and cast.
* **API-ready**. Every store function can be called via API. API calls have more relaxed constraints.
* **Tons of hooks**. You can hook yourself to every step of the store processing process: `afterValidate()`,   `afterCheckPermissions()`, `afterDbOperation()`, `afterEverything()`
* **Authentication hooks**. Only implement things once, and keep authentication tight.
* **Mixin-based**. You can add functionalities easily.
* **Inheriting stores**. You can easily derive a store from another one.
* **Simple error management**. Errors can be chained up, or they can make the store return them to the client.

JsonRestStores even comes with its own database layer mixin, SimpleDbLayerMixin, which will implement all of the important methods that will read, write and delete elements from a database. The mixin uses [simpledblayer](https://github.com/mercmobily/simpledblayer) to access the database. For now, only MongoDb is supported but more will come.

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
* When implementing `GET /bookings/`, you need to parse the URL in order to enable data filtering (for example, `GET /bookings?dateFrom=1976-01-10&name=Tony` will need to filter, on the database, all bookings made after the 10th of January 1976 by Tony).
* When implementing `GET /bookings/`, you need to return the right `Content-Range` HTTP headers in your results so that the clients know what range they are getting.
* When implementing `GET /bookings/`, you also need to make sure you take into account any `Range` header set by the client, who might only want to receive a subset of the data
* With `POST` and `PUT`, you need to make sure that data is validated against some kind of schema, and return the appropriate errors if it's not.
* With `PUT`, you need to consider the HTTP headers `If-match` and `If-none-match` to see if you can//should//must overwrite existing records 
* All unimplemented methods should return a `501 Unimplemented Method` server response

This is only a short list of obvious things. There are many more to consider. The point is, when you make a store you should be focusing on the important parts (the data you manipulate, and permission checking) rather than repetitive, boilerplate code.

With JsonRestStores, you can create JSON REST stores without ever worrying about any one of those things. You can concentrate on what _really_ matters: your application's data and logic.

## Understand a little about REST stores

If you are new to REST and web stores, you will probably benefit by reading a couple of important articles. Understanding the concepts behind REST stores will make your life easier.

I suggest you read [John Calcote's article about REST, PUT, POST, etc.](http://jcalcote.wordpress.com/2008/10/16/put-or-post-the-rest-of-the-story/). (It's a fantastic read, and I realised that it was written by John, who is a long term colleague and fellow writer at Free Software Magazine, only much later!).

You should also read my small summary of [what a REST store actually provides](https://github.com/mercmobily/JsonRestStores/blob/master/jsonrest.md).

At this stage, the stores are 100% compatible with [Dojo's JsonRest](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html) as well as [Sitepen's dstore](http://dstorejs.io/).

# Quickstart

Jsonreststores is a module that creates managed routes for you, and integrates very easily with existing ExpressJS applications.

## Modules used by JsonRestStores

Here is a list of modules used by JsonRestStores. You should be at least slightly familiar with them.

* [SimpleDeclare - Github](https://github.com/mercmobily/SimpleDeclare). This module makes creation of constructor functions/classes a breeze. Using SimpleDeclare is a must when using JsonRestStores -- unless you want to drown in unreadable code.

* [SimpleSchema - Github](https://github.com/mercmobily/SimpleSchema). This module makes it easy (and I mean, really easy) to define a schema and validate/cast data against it. It's really simple to extend a schema as well. It's a no-fuss module.

* [Allhttperrors](https://npmjs.org/package/allhttperrors). A simple module that creats `Error` objects for all of the possible HTTP statuses.

Note that all of these modules are fully unit-tested, and are written and maintained by me.

# Store examples

Here are three very common use-cases for JsonRest stores, fully explained: 

## A basic store

Here is how you make a fully compliant store:

      var JsonRestStores = require('jsonreststores'); // The main JsonRestStores module
      var SimpleSchema = require('simpleschema');  // The main schema module

      var Managers = declare( JRS, {

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

        constructor: function(){
          this.data = [];
        },

        implementFetchOne: function( request, cb ){
          var d = this.data[ request.params[ self.idProperty ] ];
          return d ? d : null;
        }, 

        implementInsert: function( request, generatedId, cb ){
        },

        implementUpdate: function( request, cb ){
        },

        implementDelete: function( request, cb ){
        },

        implementQuery: function( request, cb ){
        },

        implementReposition: function( doc, where, beforeId, cb ){

          switch( where ){

            case 'at':
              // Move element somewhere
              function moveElement(array, from, to) {
                if( to !== from ) array.splice( to, 0, array.splice(from, 1)[0]);
              }
            break;

            case 'start':
              // Move element at the beginning of the array
            break;

            case 'end':
              // Move element at the end of the array
            break;
          }

          cb( null );
        }

      });

      var managers = new Managers(); 
      managers.setAllRoutes( app );


That's it: this is enough to make a full store which will handly properly all of the HTTP calls. Try it if you don't believe me!

* `Managers` is a new class that inherits from `JRS`. Creating the derived class is the first step towards creating a store
* `schema` is an object of type Schema that will define what's acceptable in a REST call
* `publicURL` is the URL the store is reachable at. ***The last one ID is the most important one***: the last ID in `publicURL` (in this case it's also the only one: `id`) defines which field, within your schema, will be used as _the_ record ID when performing a PUT and a GET (both of which require a specific ID to function).
* `storeName` (_mandatory_) needs to be a unique name for your store. It is mandatory to have one, as (when used with a database) it will define the name of the DB table/collection
* `handleXXX` are attributes which will define how your store will behave. If you have `handlePut: false` and a client tries to PUT, they will receive an `NotImplemented` HTTP error
* `implementXXX` methods are the ones that actually implement the data access functionality
* `managers.setAllRoutes( app )` creates the right Express routes to actually activate your stores. Specifically:

    // Make entries in "app", so that the application
    // will give the right responses
    app.get(      url + idName, this.getRequestHandler( 'Get' ) );
    app.get(      url,          this.getRequestHandler( 'GetQuery') );
    app.put(      url + idName, this.getRequestHandler( 'Put') );
    app.post(     url,          this.getRequestHandler( 'Post') );
    app.delete(   url + idName, this.getRequestHandler( 'Delete') );


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

* Add `id: { type: id }` to the schema automatically. This is done so that you don't have to do the grunt work of defining id fields both in `publicURL` and in the schema
* Create the `paramIds` array for the store. In this case, `paramIds` will be `[ 'id' ]`.

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

    var managers = new Managers();
    managers.setAllRoutes( app ); // This will throw()

Note that:
 * The `id` parameter had to be defined in the schema
 * The `paramIds` array had to be defined by hand
 * `managers.setAllRoutes( app )` couldn't be used as the public URL is not there
 * You cannot define, in the prototype, both publicURL and paramIds

This pattern is much more verbose, and it doesn't allow the store to be placed online.

In the documentation, I will often refers to `paramIds`, which is an array of element in the schema which match the ones in the route. However, in all examples I will use the "shortened" version without repeating IDs unnecessarily.

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
      var managers = new Managers();
      managers.setAllRoutes( app );


      var ManagersCars = declare( JRS, {

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

        hardLimitOnQueries: 50,
      });

      var managersCars = new ManagersCars();
      managersCars.setAllRoutes( app );
 

You have two stores: one is the simple `managers` store with a list of names and surname; the other one is the `managersCars` store: note how the URL for `managersCars` includes `managerId`.

The managersCars store will will respond to `GET /managers/2222/cars/3333` (to fetch car 3333 of manager 2222), `GET /workspace/2222/users` (to get all cars of manager 2222), and so on.

Remember that in `managersCars`:

* Remote queries will _always_ honour the filter on `managerId`, both in queries and single-record operations.

### On naming conventions

It's important to be consistent in naming conventions while creating stores. In this case, code is cleared than a thousand bullet points:

#### Naming convertions for simple stores

    var Managers = declare( JRS, { 

      schema: new Schema({
        // ...
      });

      // ...
      storeName: `managers`
      // ...
    }
    var managers = new Managers();
    managers.setAllRoutes( app );



    var People = declare( JRS, { 

      schema: new Schema({
        // ...
      });

      // ...
      storeName: `people`
      // ...
    }
    var people = new People();
    people.setAllRoutes( app );

* Store names anywhere are plural (they are collections representing multiple entries)
* Irregulars (Person => People) are a fact of life
* Store constructors (derived from JRS) are in capital letters (as constructors, they should be)
* Store variables are in small letters (they are normal variables)
* storeName attributes are in small letters (to follow the lead of variables)
* URL are in small letters (following the stores' names, plus `/Capital/Urls/Are/Silly`)

# YOU ARE HERE (REDOCUMENTING)

#### Naming conventions for nested stores    

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
* `X-rest-just-reposition`. If set, JsonRestStore will actually ignore the data, and will simply reposition the item as it was. This is useful if you want your client to trigger a reposition without re-submitting (useless) data to the server.

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

## Queries

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


