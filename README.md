JsonRestStores
==============

A module to create JsonRest stores compatible with Dojo in secods (or minutes, depending how how complex the underlying structure is).


# Implementing a store

First of all, if you are new to REST and web stores, I suggest you read my friend's [John Calcote's article about REST, PUT, POST, etc.](http://jcalcote.wordpress.com/2008/10/16/put-or-post-the-rest-of-the-story/). (It's a fantastic read, and I realised that it was written by John only much later!).

You should also read [Dojo's JsonRest stores documentation](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html), because the stores created using this module are 100% compliant with what Dojo's basic JsonRest module sends to servers.

Having said all this, this is the easiest way to implement a store:


    /// ...
    var Store = require('jsonreststores'),
        Schema = Store.Schema;
    
    var PeopleStore = declare( Store,  {
      storeName: 'people',

      schema: new Schema({
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

    Store.make.All( app,  '/call/People/', ':personId', PeopleStore );


That's it: this is enough to make a full store which will handly properly all of the HTTP calls. Try it if you don't believe me!

I have to put my honest hat on, and admit that although this store responds to all of the HTTP requests properly, it's a _cheat_: it doesn't actually store anything; it just pretends to.

To deal with real stores, have a look at the module [JsonRestStores-mongo (Github)](https://github.com/mercmobily/JsonRestStoresMongo) or [jsonreststores-mongo (NPM)](https://npmjs.org/package/jsonreststores-mongo), which is an implementation of a sub-class actually changing MongoDB collections. However, before you do that, you should read this documentation, _and_ keep it handy when you develop your own specialised (MongoDb?) stores.

# What actually happend

When you run `Store.Make.All`, you actually ran this:

    Store.make.All = function( app, url, idName, Class ){
      app.get(      url + idName, Store.make.Get( Class ) );
      app.get(      url,          Store.make.GetQuery( Class ) );
      app.put(      url + idName, Store.make.Put( Class ) );
      app.post(     url,          Store.make.Post( Class ) );
      app.post(     url + idName, Store.make.PostAppend( Class ) );
      app.delete(   url + idName, Store.make.Delete( Class ) );
    }

The function `Store.make.Get()`, called here, simply does this:

    // Make Store.makeGet, Store.makeGetQuery, etc.
    Store.make.Get = function( Class ){
      return function( req, res, next ){
        var request = new Class();
        request._makeGet( req, res, next );
      }
    }

Basically, an object of type `PeopleStore` was created, and its method `_makeGet()` was called passing it `req`, `res`, `next`. It's important to create a new object: even though the library itself doesn't define any object attributes, user defined method might well do. If the module used the same object for every request, all requests would share the same namespace.

The method `_makeGet()` is a general method that handles GET requests. In your application, you will need the method to do very specialised things. That's why `_makeGet()` (but allso all of the others: `_makePut()`, `_makePost()`, etc. ) do everything using class functions that you will most definitely override. (Note that you don't _have to_ override them: no override will give you a fully functional, "default" store).

# Customising your store: general overview

At this point, you are aware that there are six crucial methods for each store:

 * `_makeGet()` (implements GET for one single document)
 * `_makeGetQuery()` (implements GET for a collection, no ID passed)
 * `_makePut()` (implements PUT for a collection)
 * `_makePost()` (implements POST for a collection)
 * `_makePostAppend()` (implements POST for a collection, when ID is present)
 * `_makeDelete()` (implements DELETE for a collection)

There are also some functions used by them, which will change according to the store:

 * `_checkId()` (check that the passed ID is OK for the DB engine)
 * `_castId()` (cast the passed value to one of type ID for that DB engine)

These are the functions and attributes you are able to change:

**IMPORTANT: Database functions**  
 *  allMakeId( doc, cb ) (create an ID; for Mongo, this is likely to be a "ObjectId()", for MySql it will be the next autoIncrement, etc.
 * `allDbExtrapolateDoc( fullDoc, req, cb )`(from the fetched document, extrapolate the data you actually want)
 * `allDbFetch( req, cb )` (fetch a document based on `req`)
 * `getDbQuery( req, res, next, sortBy, ranges, filters )` (executes the query; this is the only DB function that needs to handle the response)
 * `putDbInsert( body, req, cb )`(inserts a record in the DB after a PUT)
 * `putDbUpdate( body, req, doc, fullDoc, cb )`(updates a record in the DB after a PUT)
 * `postDbInsertNoId( body, req, cb )`(adds a new record to the DB; a new ID will be created)
 * `postDbAppend( body, req, doc, fullDoc, cb )` (appends information to existing record after PUT)
 * `deleteDbDo( req, cb )`(deletes a record)
 * `getDbPrepareBeforeSend( doc, cb )`(manipulate a record jut before sending it back to the client)

**IMPORTANT: Attributes**  
 * `schema: null` (The schema, used to validate incoming data. An object created by a SimpleSchema constructor)
 * `paramIds: [ ]` (List of IDs; this is a subset of the ones appearing in the URL -- that is, the IDs relevant to the store. For example you might have, for your application URL, `/:workspaceId/users/:level/:userId`; in this case, `paramIds` would be `['level', 'userId']`) which are the ones used by the store to filter data)
 * `storeName: null` (The name of the store)

**IMPORTANT: Other attributes to set handled requests**  
 * `handlePut: true`
 * `handlePost: true`
 * `handlePostAppend: true`
 * `handleGet: true`
 * `handleGetQuery: true`
 * `handleDelete: true`

**Permission functions**  
 * `checkPermissionsPost( req, cb )` (`cb()` will be called with `cb(null, true)` if granted, `cb(null, false)` for not granted)
 * `checkPermissionsPostAppend( req, doc, fullDoc, cb )`
 * `checkPermissionsPutNew( req, cb )`
 * `checkPermissionsPutExisting( req, doc, fullDoc, cb )`
 * `checkPermissionsGet( req, doc, fullDoc, cb )`
 * `checkPermissionsDelete( req, doc, fullDoc, cb )`

**Redefinable after-op functions** 
 * `afterPutNew( req, body, doc, fullDoc, overwrite, cb )` (Called after a new record is PUT)
 * `afterPutExisting( req, body, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb )` (After a record is overwritten with PUT)
 * `afterPost( req, body, doc, fullDoc, cb )` (After a new record is POSTed)
 * `afterPostAppend( req, body, doc, fullDoc, docAfter, fullDocAfter, cb )` (After an existing record is POSTed)
 * `afterDelete( req, doc, fullDoc cb )` (After a record is deleted)
 * `afterGet( req, doc, fullDoc, cb )` (After a record is retrieved)

**Redefinable generic functions** 
  * `formatErrorResponse( error )` (Function to format the response in case of errors)
  * `logError( error )` (Function called every time an error occurs)

**HTTP Errors**
  * `BadRequestError`
  * `UnauthorizedError`
  * `ForbiddenError`
  * `NotFoundError`
  * `PreconditionFailedError`
  * `UnprocessableEntityError`
  * `NotImplementedError`
  * `ServiceUnavailableError`

**Less important attribute I couldn't find a spot for**
 *  chainErrors ('none': never call `next(err)`, 'nonhttp': only call `next(err)` for non-http errors, 'all': always call `next(err)`

Note that the `MongoStore` module already _does_ overrides the **Database functions** (which would normally be redefined by you), in order to give a working store for you to enjoy. Your own overriding functions could be heavily inspired by these.

# What happens in each call

JsonRestStores does all of the boring stuff for you -- the kind things that you would write over and over and over again while developing a server store.

When using JsonRestStores, you are likely to 1) Use a specialised store 2) Redefine the functions marked above as **IMPORTANT: Database functions**. However, in order to really get it right, it's important to know what actually happens in each call.

## Store.make.Get( Class )

* **Check that `self.handleGet` is true**

* **Runs `self._checkParamIds( req.params, errors )`**. This will cast req.params so that each corresponding field is validated using `self.checkId()`, and cast by `self.castId()`. This means that if you have `/users/:userId` (and therefore `paramIds` is `['userId']`), req.params.userId will be checked and cast.

* **Runs `self.allDbFetch()**. The record is fetched. It's important that the _whole_ record is fetched by this function.

* **Runs `self.allDbExtrapolateDoc()`**. This is important as in some cases you only want a sub-section of the fetched record (for example, only a bunch of fields or the result of `JSON.parse()` of a specific field, etc. Basically, this turns whatever was fetched from the DB into whatever you want returned.

* **Runs `self.checkPermissionsGet()`**

* **Runs `self.afterGet()`**. This is a hook called "after" everything is done in terms of send. However, it's called *before* sending the response to the client. So, it can still make things fail if needed.

* **Runs `self.getDbPrepareBeforeSend()`**. This is a "preparation" function: a function that can manipulate the item just before sending it

* **SEND item to client**

As you can see, this is exactly what you would do, a million times over and over again, to implement a `GET()` in a store: fetch the data, manipulate it, check permissions, do last-minute changes, send it over.

## Store.make.Put( Class ) 

TODO (In the meantime, look at the source!)

## Store.make.Post( Class ) 

TODO (In the meantime, look at the source!)

## Store.make.PostAppend( Class )

TODO (In the meantime, look at the source!)

## Store.make.Delete( Class ) 

TODO (In the meantime, look at the source!)

## Store.make.GetQuery( Class ) 

TODO (In the meantime, look at the source!)


# History and concepts behind it

I was developing a one-page Ajax application completely based on stores: there is a rich client, and a bunch of stores server-side which comply with the cloudy (excuse my pun) JsonRest specifications. I soon realised that creating a store is often a rather complicated process: there are several HTTP methods to _possibly_ implement, and a lot of things to take care of (like permissions, etc.).

I soon realised that the server side of the story was going to become a bunch of unmaintainable, repeated code. I couldn't have it. So, JsonRestStores was born.

Point list:

* Follows the KISS principle: everything is kept as simple as possible.

* 100% compliant with [Dojo's JsonRest stores](http://dojotoolkit.org/reference-guide/1.8/dojo/store/JsonRest.html). This means for example that if you specify the option `{ overwrite: true }` for your store, the server will handle the if-match and if-none-match headers and will call the right method accordingly. Same applies with 

* 100% compliant with Dojo's query format. Dojo's `query()` call sends specific fields to the client. This module has everything you need so that you can concentrate on your data, rather than interpreting HTTP headers

* It's well structured: there is a base class, that provides all of the important methods; it works out of the box, returning dummy data. The base class is obviously not very useful: Database-specific sub-classes are what developers will use. At the moment, the following databases are supported:
  * Mongodb

* It uses simpleschema for simple, extendible error checking. 

* It uses OOP patterns neatly using simpledeclare: each store is a javascript constructor which inherits from the database-specific constructor (which inherits itself from a generic, base constructor).

* DB-specific stores are build with the principle of "sane defaults": without giving them any special parameters, they will "just work" mapping a database collection to a store/schema.

* The schema is very simple, and there is always one schema per store (although you can obviously re-use a schema variable). Schemas are responsible of 1) Casting input fields to their right type. This means that a field marked as "number" will be cast to a JS number 2) Trimming and input validation. Each type offers a bunch of helper functions. You can also define a schema-wide validate() function.

* Schemas and stores are _flat_. No, no nested documents within documents (KISS, remember?). While your database might (and probably will) have nested arrays etc., complex structures, etc., in JsonRestStores here is only one level. So you might have a store that only returns the top level of information in your mongoDb document, and then another store that fetches data from the same collection, but only returning specific sub-documents. The reasons:
  * Stores are built on top of HTTP. In HTTP, forms don't have nested values (except for arrays, created if you have several variables going with by the same name)
  * When there is a problem, the server responds with a field name, and an error message. Easy. Try that with nested data structures, and email me when you are done (successfully).
  * It's best to keep things simple -- very simple. If you are submitting complex, highly structured data often between your client and your server, you might want to check if it's beneficial to break everything up.


 
