/*
Copyright (C) 2013 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*
NOTE. When creating a store, you can take the following shortcuts:
  * Don't specify `paramIds`. If not specified, it will be worked out from publicURL
  * Don't specify `idProperty`. If idProperty not specified, it will be assumed last element of paramIds
  * Don't specify `paramIds` in schema. They will be added to the schema as `{type: 'id' }` automatically
  * Don't specify `onlineSearchSchema`. It will be worked out taking all schema element marked as
    `searchable: true` (except paramIds)
*/

var 
  dummy
, e = require('allhttperrors')
, declare = require('simpledeclare')
, Schema = require('simpleschema')
, async = require('async')
, SimpleDbLayerMixin = require('./SimpleDbLayerMixin.js')
, HTTPMixin = require('./HTTPMixin.js')
;

var Store = declare( Object,  {

  // ***********************************************************
  // *** ATTRIBUTES THAT ALWAYS NEED TO BE DEFINED IN PROTOTYPE
  // ***********************************************************

  storeName: null,
  schema: null,

  // ****************************************************
  // *** ATTRIBUTES THAT CAN TO BE DEFINED IN PROTOTYPE
  // ****************************************************

  onlineSearchSchema: null, // If not set in prototype, worked out from `schema` by constructor
  queryConditions: null, // If not set in prototype, worked out from `schema` by constructor 
  sortableFields: [],
  publicURL: null, // Not mandatory (if you want your store to be API-only for some reason)
  idProperty: null, // If not set in prototype, taken as last item of paramIds)
  paramIds: [], // Only allowed if publicURL is not set

  // ****************************************************
  // *** ATTRIBUTES THAT DEFINE STORE'S BEHAVIOUR
  // ****************************************************

  handlePut: false,
  handlePost: false,
  handleGet: false,
  handleGetQuery: false,
  handleDelete: false,

  echoAfterPutNew: true,
  echoAfterPutExisting: true,
  echoAfterPost: true,
  echoAfterDelete: true,

  chainErrors: 'none',  // can be 'none' (do not chain), 'all' (chain all), 'nonhttp' (chain non-HTTP errors)

  deleteAfterGetQuery: false, // Delete records after fetching them

  strictSchemaOnFetch: true,

  position: false,    // If set, will make fields re-positionable
  defaultSort: null,  // If set, it will be applied to all getQuery calls

  // Methods that MUST be implemented for the store to be functional

  implementFetchOne: function( request, cb ){
    throw("implementFetchOne not implemented, store is not functional");
  }, 

  implementInsert: function( request, forceId, cb ){
    throw("implementInsert not implemented, store is not functional");
  },

  implementUpdate: function( request, deleteUnsetFields, cb ){
    throw("implementUpdate not implemented, store is not functional");
  },

  implementDelete: function( request, cb ){
    throw("implementDelete not implemented, store is not functional");
  },

  implementQuery: function( request, next ){
    throw("implementQuery not implemented, store is not functional");
  },

  implementReposition: function( doc, where, beforeId, cb ){    
    throw("implementReposition not implemented, store is not functional");
  },


  // ****************************************************
  // *** FUNCTIONS THAT CAN BE OVERRIDDEN BY DEVELOPERS
  // ****************************************************

  // Doc extrapolation and preparation calls
  prepareBody: function( request, method, body, cb ){ cb( null, body ); },
  extrapolateDoc: function( request, method, doc, cb ){ cb( null, doc ); },
  prepareBeforeSend: function( request, method, doc, cb ){ cb( null, doc ); },

  // Permission stock functions
  checkPermissions: function( request, method, cb ){ cb( null, true ); },
  
  // after* functions 
  afterValidate: function( request, method, cb ){ cb( null ); }, 
  afterCheckPermissions: function( request, method, cb ){ cb( null ); },
  afterDbOperation: function( request, method, cb ){ cb( null ); },
  afterEverything: function( request, method, cb ) { cb( null ); },

  logError: function( error ){ },

  formatErrorResponse: function( error ){

    if( error.errors ){
      return { message: error.message, errors: error.errors }
    } else {
      return { message: error.message }
    }
  },

  // **************************************************************************
  // *** END OF FUNCTIONS/ATTRIBUTES THAT NEED/CAN BE OVERRIDDEN BY DEVELOPERS
  // **************************************************************************

  // Default error objects which might be used by this module.
  BadRequestError: e.BadRequestError,
  UnauthorizedError: e.UnauthorizedError,
  ForbiddenError: e.ForbiddenError,
  NotFoundError: e.NotFoundError,
  PreconditionFailedError: e.PreconditionFailedError,
  UnprocessableEntityError: e.UnprocessableEntityError,
  NotImplementedError: e.NotImplementedError,
  ServiceUnavailableError: e.ServiceUnavailableError,

  constructor: function(){

    var self = this;

    // StoreName cannot be repeated amongst stores, ONE storeName per store!
    Store.registry = Store.registry || {};

    // Set artificialDelay from the constructor's default
    this.artificialDelay = Store.artificialDelay;

    if( typeof( Store.registry[ self.storeName ] ) !== 'undefined' ){
      throw new Error("Cannot instantiate two stores with the same name: " + self.storeName );
    }

    // The store name must be defined
    if( self.storeName === null  ){
      throw( new Error("You must define a store name for a store in constructor class") );
    }

    // The schema must be defined
    if( self.schema == null ){
      throw( new Error("You must define a schema") );
    }

    // If paramId is not specified, takes it from publicURL
    if( self.paramIds.length === 0 && typeof( self.publicURL ) === 'string' ){
      self.paramIds =  ( self.publicURL + '/').match(/:.*?\/+/g).map( function( i ){ return i.substr(1, i.length - 2 )  } );
    }
   
    // If idProperty is not set, derive it from self._lastParamId()
    if( ! self.idProperty ){

      if( self.paramIds.length === 0 ){
      throw( new Error("Your store needs to set idProperty, or alternatively set paramIds (idProperty will be the last paramId). Store: " + self.storeName ) );
      }

      // Sets self.idProperty, which (as for the principle of 
      // least surprise) must be the last paramId passed to
      // the store.
      self.idProperty = self._lastParamId();
    }

    // By default, paramIds are set in schema as { type: 'id' } so that developers
    // can be lazy when defining their schemas
    for( var i = 0, l = self.paramIds.length; i < l; i ++ ){
      var k = self.paramIds[ i ];
      if( typeof( self.schema.structure[ k ] ) === 'undefined' ){
         self.schema.structure[ k ] = { type: 'id' };
      }
    }

    // If onlineSearchSchema wasn't defined, then set it as a copy of the schema where
    // fields are `searchable`, EXCLUDING the paramIds fields.
    if( self.onlineSearchSchema == null ){
      var onlineSearchSchemaStructure = { };
      for( var k in self.schema.structure ){
        if( self.schema.structure[ k ].searchable && self.paramIds.indexOf( k ) ===  -1  ){
          onlineSearchSchemaStructure[ k ] = self.schema.structure[ k ];
        }
      }
      self.onlineSearchSchema = new self.schema.constructor( onlineSearchSchemaStructure );
    } 

    // If queryConditions is not defined, create one
    // based on the onlineSearchSchema (each field is searchable)
    if( self.queryConditions == null ){
      self.queryConditions = { name: 'and', args: [ ] };
      for( var k in self.onlineSearchSchema.structure )
        self.queryConditions.args.push( { name: 'eq', args: [ k, '#' + k + '#' ] } );

      // TODO: take AND out if Object.keys( self.onlineSearchSchema.structure ).length is only 1
    }


    Store.registry[ self.storeName ] = self;
  },

  // Simple function that shallow-copies an object. This should be used
  // every time  prepareBody, extrapolateDoc or prepareBeforeSend are
  // overridden (in order to pass a copy of the object)
  _co: function( o ){
    var newO = {};
    for( var k in o ) if( o.hasOwnProperty( k ) ) newO[ k ] = o[ k ];
    return newO;
  },

  // Will call implementReposition based on options.
  // -putBefore is an id.
  // -putDefaultPosition is 'start' or 'end'.
  // -existing is true or false: true for existing records false for new ones
  // 
  // When calling implementReposition:
  // - where can be 'start', 'end' or 'before'
  // - beforeId is only meaningful for 'before' (tell is where to place it)
  // - existing is boolean, and it's only meaningful if this.position is there 
  _repositionBasedOnOptions: function( fullDoc, putBefore, putDefaultPosition, existing, cb ){

    // No position field: nothing to do
    if( ! this.position ){
       return cb( null );
    }
    
    // CASE #1: putBefore is set: where = at, beforeId = putBefore 
    if( putBefore ) {
      this.implementReposition( fullDoc, 'before', putBefore, cb );

    // CASE #2: putDefaultPosition is set: where = putDefaultPosition, beforeId = null
    } else if( putDefaultPosition ){
      this.implementReposition( fullDoc, putDefaultPosition, null, cb );

    // CASE #3: putBefore and putDefaultPosition are not set. IF it's a new record, where = end, beforeId = null
    } else if( !existing) {
      this.implementReposition( fullDoc, 'end', null, cb );

    // CASE #4: don't do anything.
    } else {
      cb( null );
    }
  },

  // TODO: Check what happens when sorting for a nested field with a 1:n relationship with table (?!)


  // ****************************************************
  // *** INTERNAL FUNCTIONS, DO NOT TOUCH
  // ****************************************************

  _extrapolateDocAndprepareBeforeSendAll: function( request, method, fullDocs, cb ){

    var self = this;

    var changeFunctions = [];
    var docs = [], preparedDocs = [];

    async.each(
      fullDocs,
      function( fullDoc, callback ){
        self.extrapolateDoc( request, method, fullDoc, function( err, doc ){
          if( err ) return callback( err );

          docs.push( doc );

          self.prepareBeforeSend( request, method, doc, function( err, preparedDoc ){
            if( err ) return callback( err );

            preparedDocs.push( preparedDoc );

            callback( null );
          });
        });

      },
      function( err ){
        if( err ) return cb( err );

        cb( null, docs, preparedDocs );
      }
    );

  },
    
  _lastParamId: function(){
    return this.paramIds[ this.paramIds.length -1 ];
  },


  // Check that paramsId are actually legal IDs using
  // paramsSchema.
  _checkParamIds: function( request, skipIdProperty, next ){

    var self = this;
    var errors = [];

    // Params is empty: nothing to do, optimise a little
    if( request.params.length === 0 ) return cb( null );

    // Check that ALL paramIds do belong to the schema
    self.paramIds.forEach( function( k ) {
      if( typeof( self.schema.structure[ k ] ) === 'undefined' ){
        throw new Error( 'This paramId must be in schema: ' + k);
      }
    });

    // If it's a remote request, check that _all_ paramIds are in params
    // (Local API requests can avoid passing paramIds)
    if( request.remote ){
      self.paramIds.forEach( function( k ) {

        // "continue" if id property is to be skipped
        if( skipIdProperty && k == self.idProperty ) return;

        // Required paramId not there: puke!
        if( typeof( request.params[ k ] ) === 'undefined' ){
          errors.push( { field: k, message: 'Field required in the URL: ' + k } ); 
        }
      });
      // If one of the key fields was missing, puke back
      if( errors.length ) return next( new self.BadRequestError( { errors: errors } ) );
    };


    // Prepare skipParams and skipCast, depending on skipIdProperty
    var skipParams = {};
    var skipCast = [ ];
    if( skipIdProperty ){
      skipParams[ self.idProperty ] = [ 'required' ];
      skipCast.push( self.idProperty );
    }

    // Validate request.params
    self.schema.validate( request.params, { onlyObjectValues: true, skipParams: skipParams, skipCast: skipCast }, function( err, params, errors ){

      if( err ){
        next( err );
      } else {

        // There was a problem: return the errors
        if( errors.length ){
          next( new self.BadRequestError( { errors: errors } ) );
        } else {

          // Make sure request.params contains cast values
          request.params = params;

          next( null );
        }
      }
    });

  },

  _sendError: function( request, method, next, error ){

    var self = this;

    // It's a local call: simply call the callback passed by the caller
    if( ! request.remote ){
      next( error, null );
      return;
    }

    // This will happen when _sendError is passed an error straight from a callback
    // The idea is that jsonreststores _always_ throws an HTTP error of some sort.

    switch( self.chainErrors ){

      case 'all':
        next( error );
      break;

      case 'none':
      case 'nonhttp':

        // CASE #1: It's not an HTTP error and it's meant to chain non-HTTP errors: chain (call next)
        if( typeof( e[ error.name ] ) === 'undefined' && self.chainErrors === 'nonhttp' ){
           next( error );

        // CASE :2: Any other case. It might be an HTTP error or a JS error. Needs to handle both cases
        } else {

          // It's not an HTTP error: make up a new one, and incapsulate original error in it
          if( typeof( e[ error.name ] ) === 'undefined'  ){
            error = new self.ServiceUnavailableError( { originalErr: error } );
          } 

          // Make up the response body based on the error, attach it to the error itself
          error.responseBody =  self.formatErrorResponse( error );
          error.originalMethod = method;

          // Send the response, with `error` as pseudo-method
          self.sendData( request, 'error', error );
        }
      break;

    }
 
    self.logError( error );
  },

  _checkPermissionsProxy: function( request, method, cb ){

    // It's an API request: permissions are totally skipped
    if( !request.remote ) return cb( null, true );

    this.checkPermissions( request, method, cb );
  },

  _enrichBodyWithParamIdsIfRemote: function( request ){

    var self = this;

    if( request.remote ){
      self.paramIds.forEach( function( paramId ){
        if( typeof( request.params[ paramId ] ) !== 'undefined' ){
          request.body[ paramId ] = request.params[ paramId ];
        }
      });
    }
  },

  errorInSending: function( request, method, data, when, error ){
    self.logError( error );
  },

  // Method that will call the correct `protocolSend?????` method depending on
  // request.protocol 
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

  _internalBeforeSendData: function( request, method, data, cb ){
    cb( null );
  },

  _internalAfterSendData: function( request, method, data, cb ){
    cb( null );
  },

  protocolListen: function( protocol, params ){
    var n = 'protocolListen' + protocol;
    var f = this[ n ];

    // The method must be implemented
    if( !f ) throw ("Error: function self." + n + " not implemented!");

    f.call( this, params );
  },

  _makePost: function( request, next ){

    var self = this;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Prepare request.data
    request.data = request.data || {};

    // Check that the method is implemented
    if( ! self.handlePost && request.remote ){
      return self._sendError( request, 'post', next, new self.NotImplementedError( ) );
    }

    // Check the IDs
    self._checkParamIds( request, true, function( err ){  
      if( err ) return self._sendError( request, 'post', next, err );

      self.prepareBody( request, 'post', request.body, function( err, preparedBody ){
        if( err ) return self._sendError( request, 'post', next, err );

        // Request is changed, old value is saved 
        request.bodyBeforePrepare = request.body;
        request.body = preparedBody;

        var skipParamsObject = {};
        skipParamsObject[ self.idProperty ] = [ 'required' ];
        self._enrichBodyWithParamIdsIfRemote( request );

        // Delete _children which mustn't be here regardless
        delete request.body._children;

        self.schema.validate( request.body, { skipParams: skipParamsObject, skipCast: [ self.idProperty ]  }, function( err, validatedBody, errors ){
          if( err ) return self._sendError( request, 'post', next, err );

          if( request.remote ){
            // Protected field are not allowed here
            for( var field in request.body ){
              if( self.schema.structure[ field ].protected && typeof( request.body[ field ] ) !== 'undefined'){
                errors.push( { field: field, message: 'Field not allowed because protected: ' + field + ' in ' + self.storeName } );
              }
            } 
          }

          request.bodyBeforeValidation = request.body;
          request.body = validatedBody;

          if( errors.length ) return self._sendError( request, 'post', next, new self.UnprocessableEntityError( { errors: errors } ) );
 
          self.afterValidate( request, 'post', function( err ){
            if( err ) return self._sendError( request, 'post', next, err );
  
            // Actually check permissions
            self._checkPermissionsProxy( request, 'post', function( err, granted ){
              if( err ) return self._sendError( request, 'post', next, err );
            
              if( ! granted ) return self._sendError( request, 'post', next, new self.ForbiddenError() );

              self.afterCheckPermissions( request, 'post', function( err ){
                if( err ) return self._sendError( request, 'post', next, err );

                // Clean up body from things that are not to be submitted
                self.schema.cleanup( request.body, 'doNotSave' );
              
                self.schema.makeId( request.body, function( err, forceId ){
                  if( err ) return self._sendError( request, 'post', next, err );

                  self.implementInsert( request, forceId, function( err, fullDoc ){
                    if( err ) return self._sendError( request, 'post', next, err );

                    request.data.fullDoc = fullDoc;

                    self._repositionBasedOnOptions( request.data.fullDoc, request.options.putBefore, request.options.putDefaultPosition, false, function( err ){
                      if( err ) return self._sendError( request, 'post', next, err );

                      self.afterDbOperation( request, 'post', function( err ){
                      if( err ) return self._sendError( request, 'post', next, err );

                        self.extrapolateDoc( request, 'post', request.data.fullDoc, function( err, doc ) {
                          if( err ) return self._sendError( request, 'post', next, err );

                          request.data.doc = doc;

                          self.prepareBeforeSend( request, 'post', request.data.doc, function( err, preparedDoc ){
                            if( err ) return self._sendError( request, 'post', next, err );

                            request.data.preparedDoc = preparedDoc;

                            self.afterEverything( request, 'post', function( err ){
                              if( err ) return self._sendError( request, 'post', next, err );
               
                              if( request.remote ){
                                if( self.echoAfterPost ){
                                  self.sendData( request, 'post', request.data.preparedDoc );
                                } else {
                                  self.sendData( request, 'post', '' );
                                }
                              } else {                                
                                next( null, request.data.preparedDoc, request );
                              }
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },

  _makePut: function( request, next ){

    var self = this;
    var overwrite;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Prepare request.data
    request.data = request.data || {};

    // Check that the method is implemented
    if( ! self.handlePut && request.remote ){
      return self._sendError( request, 'put', next, new self.NotImplementedError( ) );
    }

    // Check the IDs.
    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, 'put', next, err );

      self.prepareBody( request, 'put', request.body, function( err, preparedBody ){
        if( err ) return self._sendError( request, 'put', next, err );

        // Request is changed, old value is saved 
        request.bodyBeforePrepare = request.body;
        request.body = preparedBody;

        self._enrichBodyWithParamIdsIfRemote( request );

        // Delete _children which mustn't be here regardless
        delete request.body._children;

        self.schema.validate( request.body, function( err, validatedBody, errors ) {
          if( err ) return self._sendError( request, 'put', next, err );

          if( request.remote){

            // Protected field are not allowed here
            for( var field in request.body ){
              if( self.schema.structure[ field ].protected && typeof( request.body[ field ] ) !== 'undefined'){
                errors.push( { field: field, message: 'Field not allowed because protected: ' + field + ' in ' + self.storeName } );
              }
            } 
          }

          request.bodyBeforeValidation = request.body;
          request.body = validatedBody;
        
          if( errors.length ) return self._sendError( request, 'put', next, new self.UnprocessableEntityError( { errors: errors } ) );
   
          self.afterValidate( request, 'put', function( err ){
            if( err ) return self._sendError( request, 'put', next, err );
 
            // Fetch the doc
            self.implementFetchOne( request, function( err, fullDoc ){
              if( err ) return self._sendError( request, 'put', next, err );

              // Check the 'overwrite' option
              if( typeof( request.options.overwrite ) !== 'undefined' ){
                if( fullDoc && ! request.options.overwrite ){
                  self._sendError( request, 'put', next, new self.PreconditionFailedError() );
                } else if( !fullDoc && request.options.overwrite ) {
                  self._sendError( request, 'put', next, new self.PreconditionFailedError() );
                } else {
                  continueAfterFetch();
                }
              } else { 
                continueAfterFetch();
              }
 
              function continueAfterFetch(){
           
                // It's a NEW doc: it will need to be an insert, _and_ permissions will be
                // done on inputted data
                if( ! fullDoc ){

                  // Actually check permissions
                  self._checkPermissionsProxy( request, 'putNew', function( err, granted ){
                    if( err ) return self._sendError( request, 'putNew', next, err );
            
                    if( ! granted ) return self._sendError( request, 'putNew', next, new self.ForbiddenError() );

                    self.afterCheckPermissions( request, 'putNew', function( err ){
                      if( err ) return self._sendError( request, 'putNew', next, err );

                      // Clean up body from things that are not to be submitted
                      // if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                      self.schema.cleanup( request.body, 'doNotSave' );
              
                      self.implementInsert( request, null, function( err, fullDoc ){
                        if( err ) return self._sendError( request, 'putNew', next, err );
              
                        request.data.fullDoc = fullDoc;

                        self._repositionBasedOnOptions( request.data.fullDoc, request.options.putBefore, request.options.putDefaultPosition, false, function( err ){
                          if( err ) return self._sendError( request, 'putNew', next, err );

                          self.afterDbOperation( request, 'putNew', function( err ){
                            if( err ) return self._sendError( request, 'putNew', next, err );

                            self.extrapolateDoc( request, 'putNew', request.data.fullDoc, function( err, doc ) {
                              if( err ) return self._sendError( request, 'putNew', next, err );
                  
                              request.data.doc = doc;

                              self.prepareBeforeSend( request, 'putNew', request.data.doc, function( err, preparedDoc ){
                                if( err ) return self._sendError( request, 'putNew', next, err );
                        
                                request.data.preparedDoc = preparedDoc;

                                self.afterEverything( request, 'putNew', function( err ){
                                  if( err ) return self._sendError( request, 'putNew', next, err );
                   
                                  if( request.remote ){
                                    if( self.echoAfterPutNew ){ 
                                      self.sendData( request, 'putNew', request.data.preparedDoc );
                                    } else {
                                      self.sendData( request, 'putNew', '' );
                                    }
                                  } else {                                
                                    next( null, request.data.preparedDoc, request );
                                  }
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
           
                // It's an EXISTING doc: it will need to be an update, _and_ permissions will be
                // done on inputted data AND existing doc
                } else {

                  request.data.fullDoc = fullDoc;
                      
                  self.extrapolateDoc( request, 'putExisting', request.data.fullDoc, function( err, doc ) {
                    if( err ) return self._sendError( request, 'putExisting', next, err );
            
                    request.data.doc = doc;
              
                    // Actually check permissions
                    self._checkPermissionsProxy( request, 'putExisting', function( err, granted ){
                      if( err ) return self._sendError( request, 'putExisting', next, err );
               
                      if( ! granted ) return self._sendError( request, 'putExisting', next, new self.ForbiddenError() );

                      self.afterCheckPermissions( request, 'putExisting', function( err ){
                        if( err ) return self._sendError( request, 'putExisting', next, err );
                
                        // Clean up body from things that are not to be submitted
                        // if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                        self.schema.cleanup( request.body, 'doNotSave' );
                
                        self.implementUpdate( request, true, function( err, fullDocAfter ){
                          if( err ) return self._sendError( request, 'putExisting', next, err );
            
                          // Update must have worked -- if it hasn't, there was a (bad) problem
                          if( ! fullDocAfter ) return self._sendError( request, 'putExisting', next, new Error("Error re-fetching document after update in putExisting") );

                          request.data.fullDocAfter = fullDocAfter;

                          self._repositionBasedOnOptions( request.data.fullDoc, request.options.putBefore, request.options.putDefaultPosition, true, function( err ){
                            if( err ) return self._sendError( request, 'putExisting', next, err );
    
                            self.afterDbOperation( request, 'putExisting', function( err ){
                              if( err ) return self._sendError( request, 'putExisting', next, err );

                              self.extrapolateDoc( request, 'putExisting', request.data.fullDocAfter, function( err, docAfter ) {
                                if( err ) return self._sendError( request, 'putExisting', next, err );
         
                                request.data.docAfter = docAfter;
                         
                                self.prepareBeforeSend( request, 'putExisting', request.data.docAfter, function( err, preparedDoc ){
                                  if( err ) return self._sendError( request, 'putExisting', next, err );

                                  request.data.preparedDoc = preparedDoc;

                                  self.afterEverything( request, 'putExisting', function( err ) {
                                    if( err ) return self._sendError( request, 'putExisting', next, err );
                     
                                    if( request.remote ){
                                      if( self.echoAfterPutExisting ){
                                        self.sendData( request, 'putExisting', request.data.preparedDoc );
                                      } else {
                                        self.sendData( request, 'putExisting', '' );
                                      }
                                    } else {                                
                                      next( null, request.data.preparedDoc, request );
                                    }
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                } // Existing or new doc
              } // continueAfterFetch
            });
          });
        });
      });
    });

  },

 
  _makeGetQuery: function( request, next ){

    var self = this;
    var sort, range, conditions;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Prepare request.data
    request.data = request.data || {};

    // Check that the method is implemented
    if( ! self.handleGetQuery && request.remote ){
      return self._sendError( request, 'getQuery', next, new self.NotImplementedError( ) );
    }
  
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( request, true, function( err ){  
      if( err ) return self._sendError( request, 'getQuery', next, err );
    
      self._checkPermissionsProxy( request, 'getQuery', function( err, granted ){
        if( err ) return self._sendError( request, 'getQuery', next, err );
    
        if( ! granted ) return self._sendError( request, 'getQuery', next, new self.ForbiddenError() );
    
        self.afterCheckPermissions( request, 'getQuery', function( err ){
          if( err ) return self._sendError( request, 'getQuery', next, err );

          self.onlineSearchSchema.validate( request.options.conditions, { onlyObjectValues: true }, function( err, conditions, errors ){
            if( err ) return self._sendError( request, 'getQuery', next, err );

            // Actually assigning cast and validated conditions to `options`
            request.options.conditions = conditions;

            // Errors in casting: give up, run away
            if( errors.length ) return self._sendError( request, 'getQuery', next, new self.BadRequestError( { errors: errors } ));

            self.afterValidate( request, 'getQuery', function( err ){
              if( err ) return self._sendError( request, 'getQuery', next, err );
          
              self.implementQuery( request, function( err, fullDocs, total, grandTotal ){
                if( err ) return self._sendError( request, 'getQuery', next, err );

                // Make `total` and `grandTotal` part of the request, exposing them to all callbacks
                request.data.fullDocs = fullDocs;
                request.data.total = total;
                request.data.grandTotal = grandTotal;

                self.afterDbOperation( request, 'getQuery', function( err ){
                  if( err ) return self._sendError( request, 'getQuery', next, err );

                  self._extrapolateDocAndprepareBeforeSendAll( request, 'getQuery', request.data.fullDocs, function( err, docs, preparedDocs ){
                    if( err ) return self._sendError( request, 'getQuery', next, err );

                    request.data.docs = docs;              
                    request.data.preparedDocs = preparedDocs;

                    self.afterEverything( request, 'getQuery', function( err ) {
                      if( err ) return self._sendError( request, 'getQuery', next, err );

                      // Remote request: set headers, and send the doc back (if echo is on)
                      if( request.remote ){
                        self.sendData( request, 'getQuery', request.data.preparedDocs );
                      // Local request: simply return the doc to the asking function
                      } else {
                        next( null, request.data.preparedDocs, request );
                      }
                    });
                  });
                });
              });
            });
          });
        });
      });
        
        
    });
  },


  _makeGet: function( request, next ){

    var self = this;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Prepare request.data
    request.data = request.data || {};

    // Check that the method is implemented
    if( ! self.handleGet && request.remote ){
      return self._sendError( request, 'get', next, new self.NotImplementedError( ) );
    }

    // Check the IDs
    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, 'get', next, err );

      // Fetch the doc.
      self.implementFetchOne( request, function( err, fullDoc ){
        if( err ) return self._sendError( request, 'get', next, err );
    
        if( ! fullDoc ) return self._sendError( request, 'get', next, new self.NotFoundError());
    
        request.data.fullDoc = fullDoc;

        self.afterDbOperation( request, 'get', function( err ){
          if( err ) return self._sendError( request, 'get', next, err );

          self.extrapolateDoc( request, 'get', fullDoc, function( err, doc) {
            if( err ) return self._sendError( request, 'get', next, err );

            request.data.doc = doc;
      
            // Check the permissions 
            self._checkPermissionsProxy( request, 'get', function( err, granted ){
              if( err ) return self._sendError( request, 'get', next, err );
          
              if( ! granted ) return self._sendError( request, 'get', next, new self.ForbiddenError() ); 
          
              self.afterCheckPermissions( request, 'get', function( err ){
                if( err ) return self._sendError( request, 'get', next, err );
            
                // "preparing" the doc. The same function is used by GET for collections 
                self.prepareBeforeSend( request, 'get', doc, function( err, preparedDoc ){
                  if( err ) return self._sendError( request, 'get', next, err );
            
                  request.data.preparedDoc = preparedDoc;

                  // Just in case: clean up any field that returned from the schema, and shouldn't have been
                  // there in the first place
                  self.schema.cleanup( preparedDoc, 'doNotSave' );
            
                  self.afterEverything( request, 'get', function( err ) {
                    if( err ) return self._sendError( request, 'get', next, err );
                        
                    // Remote request: set headers, and send the doc back
                    if( request.remote ){
            
                      // Send "prepared" doc
                      self.sendData( request, 'get', preparedDoc );

                      // Local request: simply return the doc to the asking function
                    } else {
                       next( null, preparedDoc, request );
                    }
            
                  });
                });
              });
            });
          });
        });
      });
    });
  },


  _makeDelete: function( request, next ){

    var self = this;
    
    if( typeof( next ) !== 'function' ) next = function(){};
  
    // Prepare request.data
    request.data = request.data || {};

    // Check that the method is implemented
    if( ! self.handleDelete && request.remote ){
      return self._sendError( request, 'delete', next, new self.NotImplementedError( ) );
    }
  
    // Check the IDs
    self._checkParamIds( request, false, function( err ){ 
      if( err ) return self._sendError( request, 'delete', next, err );
    
      // Fetch the doc.
      self.implementFetchOne( request, function( err, fullDoc ){
        if( err ) return self._sendError( request, 'delete', next, err );
    
        if( ! fullDoc ) return self._sendError( request, 'delete', next, new self.NotFoundError());

        request.data.fullDoc = fullDoc;
    
        self.extrapolateDoc( request, 'delete', fullDoc, function( err, doc) {
          if( err ) return self._sendError( request, 'delete', next, err );

          request.data.fullDoc = doc;
        
          // Check the permissions 
          self._checkPermissionsProxy( request, 'delete', function( err, granted ){
            if( err ) return self._sendError( request, 'delete', next, err );
        
            if( ! granted ) return self._sendError( request, 'delete', next, new self.ForbiddenError() );

            self.afterCheckPermissions( request, 'delete', function( err ){
              if( err ) return self._sendError( request, 'delete', next, err );
                  
              // Actually delete the document
              self.implementDelete( request, function( err, deletedRecord ){
                if( err ) return self._sendError( request, 'delete', next, err );

                // If nothing was returned, we have a problem: the record wasn't found (it
                // must have disappeared between implementFetchOne() above and now)
                if( !deletedRecord ) return self._sendError( request, 'delete', next, new Error("Error deleting a record in 'delete`: record to be deleted not found") );

                self.afterDbOperation( request, 'delete', function( err ){
                  if( err ) return self._sendError( request, 'delete', next, err );

                  self.prepareBeforeSend( request, 'delete', doc, function( err, preparedDoc ){
                    if( err ) return self._sendError( request, 'delete', next, err );
        
                    request.data.preparedDoc = preparedDoc;

                    self.afterEverything( request, 'delete', function( err ){
                      if( err ) return self._sendError( request, 'delete', next, err );
   
                      if( request.remote ){
                        if( self.echoAfterDelete ){
                          self.sendData( request, 'delete', preparedDoc );
                        } else {
                          self.sendData( request, 'delete', '' );
                        }
                      } else {
                        next( null, doc, request );
                      }
                    }) 
                  })
                });
              });
            });
          });
        });
      });
    });
  },


  apiGetQuery: function( options, next ){

    // Make up the request
    var request = new Object();

    request.remote = false;
    request.body = {};
    request.params = options.apiParams || {};
    request.options = this._co( options );
    request.options.delete = request.options.delete || !!this.deleteAfterGetQuery;

    // Actually run the request
    this._makeGetQuery( request, next );
  },

  apiGet: function( id, options, next){

    // Make `options` argument optional
    var len =  arguments.length;

    if( len == 2 ) { next = options; options = {}; };

    var request = new Object();
    request.remote = false;
    request.options = options;
    request.body = {};
    if( request.apiParams ) request.params = request.apiParams;
    else { request.params = {}; request.params[ this.idProperty ] = id; }

    // Actually run the request
    this._makeGet( request, next );
  },
 

  apiPut: function( body, options, next ){

    // This will only work if this.idProperty is included in the body object
    if( typeof( body[ this.idProperty ] ) === 'undefined'){
      throw( new Error("When calling Store.apiPut with an ID of null, id MUST be in body") );
    }      

    // Make `options` argument optional
    var len =  arguments.length;
    if( len == 2 ) { next = options; options = {}; };

    // Make up the request
    var request = new Object();
    request.remote = false;
    request.options = options;
    request.body = this._co( body );
    if( request.apiParams ) request.params = request.apiParams;
    else { request.params = {}; request.params[ this.idProperty ] = body[ this.idProperty ]; } 
    
    delete request.body._children;

    // Actually run the request
    this._makePut( request, next );
  },

  apiPost: function( body, options, next ){

    // Make `options` argument optional
    var len =  arguments.length;
    if( len == 2 ) { next = options; options = {}; };

    // Make up the request
    var request = new Object();
    request.remote = false;
    request.options = options;
    request.params = request.apiParams || {};
    request.body = this._co( body );
    
    delete request.body._children;

    // Actually run the request
    this._makePost( request, next );
  },


  apiDelete: function( id, options, next ){

    // Make `options` argument optional
    var len =  arguments.length;
    if( len == 2 ) { next = options; options = {}; };

    // Make up the request
    var request = new Object();
    request.body = {};
    request.options = options;
    if( request.apiParams ) request.params = request.apiParams;
    else { request.params = {}; request.params[ this.idProperty ] = id; }
    
    // Actually run the request
    this._makeDelete( request, next );
  },

});


// Get store from the class' registry
Store.getStore = function( storeName ){
  return Store.registry[ storeName ];
}

// Delete the store from the class' registry
Store.deleteStore = function( storeName ){
  delete Store.registry[ storeName ];
}


// Get all stores as a hash
Store.getAllStores = function(){
  return Store.registry;
}

// OneFieldStoreMixin, to create a one-field store based
// on a "main" parent store

Store.OneFieldStoreMixin = declare( Object,  {

  // Variables that HAVE TO be set by the inherited constructor
  storeName: null,
  publicURL: null,
  piggyField: null,

  // Only PUT and GET allowed
  handlePut: true,
  handlePost: false,
  handleGet: true,
  handleGetQuery: false,
  handleDelete: false,

  // Reset possibly overloaded function which, although inherited, wouldn't
  // make sense in a OneFieldStore context
  prepareBody: function( request, method, body, cb ){ cb( null, body ); },
  extrapolateDoc: function( request, method, doc, cb ){ cb( null, doc ); },
  prepareBeforeSend: function( request, method, doc, cb ){ cb( null, doc ); },
  
  // Making sure unwanted methods  are not even implemented
  _makePost: function( request, next ){
    next( new Error( "Method not implemented" ));
  },
  _makeDelete: function( request, next ){
      next( new Error(" Method not implemented" ));
  },
  _makeGetQuery: function( request, next ){
    next( new Error( "Method not implemented" ));
  },

  // Implement the WANTED methods: Put and Get

  _makeGet: function( request, next ){

    var self = this;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Prepare request.data
    request.data = request.data || {};

    // Check that the method is implemented
    if( ! self.handleGet && request.remote ){
      return self._sendError( request, 'get', next, new self.NotImplementedError( ) );
    }

    // Check the IDs
    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, 'get', next, err );

      // Fetch the doc.
      self.implementFetchOne( request, function( err, fullDoc ){
        if( err ) return self._sendError( request, 'get', next, err );
    
        if( ! fullDoc ) return self._sendError( request, 'get', next, new self.NotFoundError());

        request.data.fullDoc = fullDoc;

        self.afterDbOperation( request, 'get', function( err ){
          if( err ) return self._sendError( request, 'get', next, err );

          // Manipulate fullDoc: at this point, it's the WHOLE database record,
          // whereas I only want returned paramIds AND the piggyField
          for( var field in fullDoc ){
            if( ! self.paramIds[ field ] && field != self.piggyField ) delete fullDoc[ field ];
          }

          self.extrapolateDoc( request, 'get', request.data.fullDoc, function( err, doc) {
            if( err ) return self._sendError( request, 'get', next, err );
      
            request.data.doc = doc;

            // Check the permissions 
            self._checkPermissionsProxy( request, 'get', function( err, granted ){
              if( err ) return self._sendError( request, 'get', next, err );
          
              if( ! granted ) return self._sendError( request, 'get', next, new self.ForbiddenError() ); 

              self.afterCheckPermissions( request, 'get', function( err ){
                if( err ) return self._sendError( request, 'get', next, err );
               
                // "preparing" the doc. The same function is used by GET for collections 
                self.prepareBeforeSend( request, 'get', doc, function( err, preparedDoc ){
                  if( err ) return self._sendError( request, 'get', next, err );
            
                  request.data.preparedDoc = preparedDoc;

                  self.afterEverything( request, 'get', function( err ) {
                    if( err ) return self._sendError( request, 'get', next, err );
                        
                    // Remote request: set headers, and send the doc back
                    if( request.remote ){
            
                      // Send "prepared" doc
                      self.sendData( request, 'get', request.data.preparedDoc );
  
                      // Local request: simply return the doc to the asking function
                    } else {
                       next( null, request.data.preparedDoc, request );
                    }
            
                  });
                });
              });
            });
          });
        });
      });
    });
  },


  _makePut: function( request, next ){

    var self = this;
    var overwrite;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Prepare request.data
    request.data = request.data || {};

    // Check that the method is implemented
    if( ! self.handlePut && request.remote ){
      return self._sendError( request, 'put', next, new self.NotImplementedError( ) );
    }

    // DETOUR: It's a reposition. Not allowed here!
    if( typeof( request.options.putBefore ) !== 'undefined' ){
      return cb( new Error("Option putBefore not allowed in OneFieldStore"));
    }
 
    // Check the IDs.
    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, 'put', next, err );

      self.prepareBody( request, 'put', request.body, function( err, preparedBody ){
        if( err ) return self._sendError( request, 'put', next, err );

        // Request is changed, old value is saved 
        request.bodyBeforePrepare = request.body;
        request.body = preparedBody;

        self._enrichBodyWithParamIdsIfRemote( request );

        // Delete _children which mustn't be here regardless
        delete request.body._children;

        // Go through each field in body, and check that it's either
        // a paramId OR piggyField
        // After this, body will be validated with { onlyObjectValues }
        var errorsInPiggyField = [];
        for( var field in request.body ){
          if( self.paramIds.indexOf( field ) == -1 && field != self.piggyField ){
            errorsInPiggyField.push( { field: field, message: 'Field not allowed because not a paramId nor the piggyBack field: ' + field + ' in ' + self.storeName } );
          }
        }
        if( errorsInPiggyField.length ) return self._sendError( request, 'put', next, new self.UnprocessableEntityError( { errors: errorsInPiggyField } ) );


        self.schema.validate( request.body, { onlyObjectValues: true }, function( err, validatedBody, errors ) {
          if( err ) return self._sendError( request, 'put', next, err );

          if( errors.length ) return self._sendError( request, 'put', next, new self.UnprocessableEntityError( { errors: errors } ) );

          // request is changed, old value is saved (again!)
          request.bodyBeforeValidation = request.body;
          request.body = validatedBody;

          if( errors.length ) return self._sendError( request, 'put', next, new self.UnprocessableEntityError( { errors: errors } ) );

          self.afterValidate( request, 'put', function( err ){
            if( err ) return self._sendError( request, 'put', next, err );
    
            // Fetch the doc
            self.implementFetchOne( request, function( err, fullDoc ){
              if( err ) return self._sendError( request, 'put', next, err );     
             
              // OneFieldStores will only ever work on already existing records
              if( ! fullDoc ){
                return self._sendError( request, 'put', next, new self.NotFoundError());
              }         

              request.data.fullDoc = fullDoc;

              // Manipulate fullDoc: at this point, it's the WHOLE database record,
              // whereas I only want returned paramIds AND the piggyField
              for( var field in fullDoc ){
                if( self.paramIds.indexOf( field ) == -1 && field != self.piggyField ) delete fullDoc[ field ];
              }
                
              self.extrapolateDoc( request, 'putExisting', request.data.fullDoc, function( err, doc) {
                if( err ) return self._sendError( request, 'put', next, err );
          
                request.data.doc = doc;

                // Actually check permissions
                self._checkPermissionsProxy( request, 'putExisting', function( err, granted ){
                  if( err ) return self._sendError( request, 'put', next, err );
             
                  if( ! granted ) return self._sendError( request, 'put', next, new self.ForbiddenError() );

                  self.afterCheckPermissions( request, 'putExisting', function( err ){
                    if( err ) return self._sendError( request, 'put', next, err );
               
                    self.implementUpdate( request, false, function( err, fullDocAfter ){
                      if( err ) return self._sendError( request, 'put', next, err );

                      request.data.fullDocAfter = fullDocAfter;

                      // Update must have worked -- if it hasn't, there was a (bad) problem
                      if( ! fullDocAfter ) return self._sendError( request, 'put', next, new Error("Error re-fetching document after update in putExisting") );

                      // Manipulate fullDoc: at this point, it's the WHOLE database record,
                      // whereas I only want returned paramIds AND the piggyField
                      for( var field in fullDocAfter ){
                        if( self.paramIds.indexOf( field ) == -1 && field != self.piggyField ) delete fullDocAfter[ field ];
                      }

                      self.afterDbOperation( request, 'putExisting', function( err ){
                        if( err ) return self._sendError( request, 'putExisting', next, err );

                        self.extrapolateDoc( request, 'putExisting', request.data.fullDocAfter, function( err, docAfter ) {
                          if( err ) return self._sendError( request, 'putExisting', next, err );

                          request.doc.docAfter = docAfter;
                          
                          self.prepareBeforeSend( request, 'putExisting', docAfter, function( err, preparedDoc ){
                            if( err ) return self._sendError( request, 'putExisting', next, err );

                            request.doc.preparedDoc = preparedDoc;
             
                            self.afterEverything( request, 'putExisting', function( err ) {
                              if( err ) return self._sendError( request, 'putExisting', next, err );

                              if( request.remote ){
                                if( self.echoAfterPutExisting ){
                                  self.sendData( request, 'putExisting', request.data.preparedDoc );
                                } else {
                                  self.sendData( request, 'putExisting', '' );
                                }
                              } else {
                                next( null, preparedDoc, request.data.request ); 
                              }
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },

  afterEverything: function f( request, method, done){
    var self = this;

    this.inheritedAsync( f, arguments, function( err ){
      if( err ) return done( err );

      // TODO: run a _broadcast on the *parent* store, 
      //self._broadcast( request, 'storeRecordUpdate', docAfter[ self.idProperty], docAfter, done );

      //stores.workspacesContacts.broadcastStoreChanges( request, 'storeRecordUpdate', contact.id, contact, { tabId: null, cb );

      done( null );
      
    });
  },    

  constructor: function(){
    // * TODO: Check that paramIds match?
  }

});

exports = module.exports = Store;
Store.artificialDelay = 0;
Store.registry = {};

// Embed important mixins so that they are available
// without an extra require (they are VERY common)
Store.SimpleDbLayerMixin = SimpleDbLayerMixin;
Store.HTTPMixin = HTTPMixin;
