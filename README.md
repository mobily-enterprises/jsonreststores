JsonRestStores
==============

A module to create JsonRest stores compatible with Dojo in secods (or minutes, depending how how complex the underlying structure is).

# Concepts

I was developing a one-page Ajax application completely based on stores: there is a rich client, and a bunch of stores server-side which comply with the cloudy (excuse my pun) JsonRest specifications. I soon realised that creating a store is often a rather complicated process: there are several HTTP methods to _possibly_ implement, and a lot of things to take care of (like permissions, etc.).

I soon realised that the server side of the story was going to become a bunch of unmaintainable, repeated code. I couldn't have it. So, JsonRestStores was born.

Point list:

* Follows the KISS principle: everything is kept as simple as possible.

* 100% compliant with [Dojo's JsonRest stores](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html). This means for example that if you specify the option `{ overwrite: true }` for your store, the server will handle the if-match and if-none-match headers and will call the right method accordingly. Same applies with 

* 100% compliant with Dojo's query format. Dojo's `query()` call sends specific fields to the client. This module has everything you need so that you can concentrate on your data, rather than interpreting HTTP headers

* It's well structured: there is a base class, that provides all of the important methods; it works out of the box, returning dummy data. The base class is obviously not very useful: Database-specific sub-classes are what developers will use. At the moment, the following databases are supported:
  * Mongodb

* It uses OOP patterns neatly: each store is a javascript constructor which inherits from the database-specific constructor (which inherits itself from a generic, base constructor). Everything is done using a 1-page declare() method which deals with everything and gives you the opportunity to call the parent's method with `this.inherited(arguments)`

* DB-specific stores are build with the principle of "sane defaults": without giving them any special parameters, they will "just work" mapping a database table to a store/schema.

* It implements a simple schema, extendible schema. You can define your own field types, or redefine existing ones. Each database provides a specialised schema.

* The schema is very simple, and there is always one schema per store (although you can obviously re-use a schema variable). Schemas are respinsible of 1) Casting input fields to their right type. This means that a field marked as "number" will be cast to a JS number 2) Trimming and input validation. Each type offers a bunch of helper functions. You can also define a schema-wide validate() function.

* Schemas and stores are _flat_. No, no nested documents within documents (KISS, remember?). While your database might (and probably will) have nested arrays etc., complex structures, etc., in JsonRestStores here is only one level. So you might have a store that only returns the top level of information in your mongoDb document, and then another store that fetches data from the same collection, but only returning specific sub-documents. The reasons:
  * Stores are built on top of HTTP. In HTTP, forms don't have nested values (except for arrays, created if you have several variables going with by the same name)
  * When there is a problem, the server responds with a field name, and an error message. Easy. Try that with nested data structures, and email me when you are done (successfully).
  * It's best to keep things simple -- very simple. If you are submitting complex, highly structured data often between your client and your server, you might want to check if it's beneficial to break everything up.


# Implementing a store

First of all, if you are new to REST and web stores, I suggest you read my friend's [John Calcote's article about REST, PUT, POST, etc.](http://jcalcote.wordpress.com/2008/10/16/put-or-post-the-rest-of-the-story/). (It's a fantastic read, and I realised that it was written by John only much later!).

You should also read [Dojo's JsonRest stores documentation](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html), because the stores created using this module are 100% compliant with what Dojo's basic JsonRest module sends to servers.

Having said all this, this is the easiest way to implement a schema:


    /// ...
    JsonRestStores = require('JsonRestStores');
    
    var Store = JsonRestStores.Store;
    var Schema = JsonRestStore.SimpleSchema;


    var PeopleStore = declare( Store,  {
      storeName: 'people',

      schema: new Schema({
        _id       : { type: 'id', required: true },
 
        name      : { type: 'string', notEmpty: true, trim: 50, searchable: true, sortable: true, searchPartial: true },
        age       : { type: 'number', notEmpty: true , searchable: true, sortable: true },
        occupation: { type: 'string', required: false },
      }),

      paramIds: [ 'personId' ],

      handlePut: true,
      handlePost: true,
      handlePostAppend: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });

    Store.makeAll( app,  '/call/People/', ':personId', PeopleStore );


That's it: this is enough to make a full store which will handly properly all of the HTTP calls. Try it if you don't believe me!
I have to put my honest hat on, and admit that although this store responds to all of the HTTP requests properly, it's a _cheat_: it doesn't actually store anything; it just pretends to.

A much more meaningful store is one created using Mongodb:

    /// ...
    JsonRestStores = require('JsonRestStores');
    
    var Store = JsonRestStores.MongoStore;
    var Schema = MongoStore.Schema; // Enriched schema. Knows how to check/cast Mongo's ObjectIds


    var PeopleStore = declare( Store,  {
      storeName: 'people',

      schema: new Schema({
        _id       : { type: 'id', required: true },
 
        name      : { type: 'string', notEmpty: true, trim: 50, searchable: true, sortable: true, searchPartial: true },
        age       : { type: 'number', notEmpty: true , searchable: true, sortable: true },
        occupation: { type: 'string', required: false },
      }),

      paramIds: [ 'personId' ],

      handlePut: true,
      handlePost: true,
      handlePostAppend: true,
      handleGet: true,
      handleGetQuery: true,
      handleDelete: true,
    });

    Store.makeAll( app,  '/call/People/', ':personId', PeopleStore );



Now, this is no cheat: this is a _real_ implementation of a fully compliant store. At this point, you can go wild and test your Dojo grids, and programs, without spending more than 30 seconds creating fully compliant stores (this will handlea collection called "people" on your Mongo db server).

# What actually happend

What actually happened is this.
When you run Store.MakeAll, you actually ran this:

    Store.makeAll = function( app, url, idName, Class ){
      app.get(      url + idName, Store.makeGet( Class ) );
      app.get(      url,          Store.makeGetQuery( Class ) );
      app.put(      url + idName, Store.makePut( Class ) );
      app.post(     url,          Store.makePost( Class ) );
      app.post(     url + idName, Store.makePostAppend( Class ) );
      app.delete(   url + idName, Store.makeDelete( Class ) );
    }

`Store.makeGet()`, called here, simply does this:

    // Make Store.makeGet, Store.makeGetQuery, etc.
    StoreGet = function( Class ){
      return function( req, res, next ){
        var request = new Class();
        request._makeGet( req, res, next );
      }
    }

Basically, an object of type `PeopleStore` was created, and its method `_makeGet()` was called passing it `req`, `res`, `next`. It's important to create a new object: even though the library itself doesn't define any object attributes, user defined method might well do.

# Customising your store: general overview

At this point, you are aware that there are six crucial methods for each store:

 * `_makeGet()`
 * `_makeGetQuery()`
 * `_makePut()`
 * `_makePost()`
 * `_makePostAppend()`
 * `_makeDelete()`

These are the functions and attributes you are able to change:

**IMPORTANT: General functions**  
 * `extrapolateDoc( fullDoc, req )`.

**IMPORTANT: Database functions**  
 * `allDbFetch( req, cb )`
 * `getDbQuery( req, res, sortBy, ranges, filters )`
 * `putDbInsert( body, req, cb )`
 * `putDbUpdate( body, req, doc, fullDoc, cb )`
 * `postDbInsertNoId( body, req, cb )`
 * `postDbAppend( body, req, doc, fullDoc, cb )`
 * `deleteDbDo( id, cb )`
 * `allDbCheckId( id )`
 * `validate( body,  errors, cb )`
 * `getDbPrepareBeforeSend( doc, cb )`

**IMPORTANT: Attributes to set handled requests**  
 * `handlePut: true`
 * `handlePost: true`
 * `handlePostAppend: true`
 * `handleGet: true`
 * `handleGetQuery: true`
 * `handleDelete: true`

**Other attributes**  
 * `schema: null`
 * `paramIds: [ ]`
 * `storeName: null`

**Permission functions**  
 * `checkPermissionsPost( req, cb )`
 * `checkPermissionsPostAppend( req, doc, fullDoc, cb )`
 * `checkPermissionsPutNew( req, cb )`
 * `checkPermissionsPutExisting( req, doc, fullDoc, cb )`
 * `checkPermissionsGet( req, doc, fullDoc, cb )`
 * `checkPermissionsDelete( req, doc, fullDoc, cb )`

**After op functions** 
 * `afterPutNew( req, body, doc, fullDoc, overwrite )`
 * `afterPutExisting( req, body, doc, fullDoc, docAfter, fullDocAfter, overwrite )`
 * `afterPost( req, body, doc, fullDoc)`
 * `afterPostAppend( req, body, doc, fullDoc, docAfter, fullDocAfter )`
 * `afterDelete( req, doc, fullDoc )`
 * `afterGet( req, doc, fullDoc)`

**Generic functions** 
  * `formatErrorResponse( error )`
  * `logError( error )`

**HTTP Errors**
  * `BadRequestError`
  * `UnauthorizedError`
  * `ForbiddenError`
  * `NotFoundError`
  * `ValidationError`
  * `RuntimeError`

Note that the `MongoStore` module already _does_ override the **Database functions**, in order to give a working store for you to enjoy. Other non-db functions are set to sane defaults (e.g. permission functions always accept a request, formatErrorResponse does something pretty standard, etc. )


# Stores

This module is meant to be used as "containers" to database-specific code (and as little as possible of it).

## MongoStore

MongoStore is the first engine developed for JsonRestStores.



# MongoStore Examples

Here are some practical examples on how to manage basic and not-so-basic mongo stores using JsonRestStores.

## Straight store


