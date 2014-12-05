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
, url = require('url')
, async = require('async')
, querystring = require('querystring')
;

var Store = declare( null,  {

  // ***********************************************************
  // *** ATTRIBUTES THAT ALWAYS NEED TO BE DEFINED IN PROTOTYPE
  // ***********************************************************

  storeName: null,
  schema: null,

  // ****************************************************
  // *** ATTRIBUTES THAT CAN TO BE DEFINED IN PROTOTYPE
  // ****************************************************

  onlineSearchSchema: null, // If not set in prototype, worked out from `schema` by constructor
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

  chainErrors: 'none',  // can be 'none', 'all', 'nonhttp'

  deleteAfterGetQuery: false,

  strictSchemaAfterRefetching: false, // TO IMPLEMENT

  position: false,    // If set, will make fields re-positionable
  defaultSort: null,  // If set, it will be applied to all getQuery calls

  // Methods that MUST be implemented for the store to be functional
  implementFetchOne: function( request, cb ){
    throw("implementFetchOne not implemented, store is not functional");
  }, 

  implementInsert: function( request, generatedId, cb ){
    throw("implementInsert not implemented, store is not functional");
  },

  implementUpdate: function( request, cb ){
    throw("implementUpdate not implemented, store is not functional");
  },:w

  implementDelete: function( request, cb ){
    throw("implementDelete not implemented, store is not functional");
  },

  implementQuery: function( request, next ){
    throw("implementQuery not implemented, store is not functional");
  },

  implementReposition: function( doc, putBefore, putDefaultPosition, existing, cb ){
    cb( null );
  },

  // ****************************************************
  // *** FUNCTIONS THAT CAN BE OVERRIDDEN BY DEVELOPERS
  // ****************************************************

  // Doc extrapolation and preparation calls
  prepareBody: function( request, method, p, cb ){ cb( null, request.body ); }, // p takes: { }
  extrapolateDoc: function( request, method, p, cb ){ cb( null, p.fullDoc ); },// p takes: { fullDoc }
  prepareBeforeSend: function( request, method, p, cb ){ cb( null, p.doc ); },// p takes: { doc }

  // Permission stock functions
  checkPermissions: function( request, method, p, cb ){ cb( null, true ); },// p takes: { doc, fullDoc} for putExisting, get, delete
  
  // post* functions 
  postValidate: function( request, method, p, cb ){ cb( null ); }, // p takes: {}
  postCheckPermissions: function( request, method, p, cb ){ cb( null ); }, // p takes same as  checkPermissions
  postDbOperation: function( request, method, p, cb ){ cb( null ); },// p takes: { fullDoc || queryDoc }
  postEverything: function( request, method, p, cb ) { cb( null ); },// p takes: all sorts

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
      self.paramIds =  ( self.publicURL + '/').match(/:.*?\/+/g).map( function(i){return i.substr(1, i.length - 2 )  } );
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

    Store.registry[ self.storeName ] = self;
  },


  _initOptionsFromReq: function( mn, req ){

    var self = this;

    var options = {};

    // Set the 'overwrite' option if the right header
    // is there
    if( mn == 'Put' ){
      if( req.headers[ 'if-match' ] === '*' )
        options.overwrite = true;
      if( req.headers[ 'if-none-match' ] === '*' )
        options.overwrite = false;      
    }

    // Put and Post can come with extra headers which will set
    // options.putBefore and options.putDefaultPosition
    if( mn === 'Put' || mn === "Post" ){

      // The header `x-put-default-position` always wins
      if( typeof( req.headers[ 'x-put-default-position' ]) !== 'undefined'){

        // Set options.putDefaultPosition depending on passed header. Default is `false`
        if( req.headers[ 'x-put-default-position' ] === 'start' ){
          options.putDefaultPosition = 'start';
        } else {
          options.putDefaultPosition = 'end';
        }

      // There is no `x-put-default-position`: see if x-put-before is set
      // and if it is, set options.putBefore
      // NOTE: in the server context, putBefore ALWAYS needs to be an id, and NEVER null
      } else {

        if( typeof( req.headers[ 'x-put-before' ] ) !== 'undefined' )
          options.putBefore = req.headers[ 'x-put-before' ];

      }

    }

    // Set the 'SortBy', 'ranges' and 'filters' in
    // the options, based on the passed headers

    if( mn == 'GetQuery' ){
      options.sort = parseSortBy( req );
      options.ranges = parseRangeHeaders( req );
      options.filters = parseFilters( req );
    }

    return options;


    function parseSortBy( req ){

      var url_parts = url.parse( req.url, false );
      var q = url_parts.query || '';
      var sortField;
      var tokens, subTokens, subToken, subTokenClean, i;
      var sortObject = {};

      q.split( '&' ).forEach( function( item ) {

        var tokens = item.split('=');
        var tokenLeft = tokens[0];
        var tokenRight = tokens[1];

        if(tokenLeft === 'sortBy'){
          subTokens = tokenRight.split(',');
          for( i = 0; i < subTokens.length; i++ ){

            subToken = subTokens[ i ];
            subTokenClean = subToken.replace( '+', '' ).replace( '-', '' );

            if( self.sortableFields.indexOf( subTokenClean ) === -1 ){
              throw( new Error("Field selected for sorting invalid: " + subTokenClean) );
            }

            if( subTokens[ i ][ 0 ] === '+' || subTokens[ i ][ 0 ] === '-' ){
              var sortDirection = subTokens[ i ][ 0 ] == '-' ? -1 : 1;
              sortField = subTokens[ i ].replace( '+', '' ).replace( '-', '' );
              sortObject[ sortField ] = sortDirection;
            }
          }
        }
      });
      return sortObject;
    }

    function parseRangeHeaders( req ){

      var tokens;
      var rangeFrom, rangeTo, limit;
      var hr;

      // If there was a range request, then set the range to the
      // query and return the count
      if( (hr = req.headers['range']) && ( tokens = hr.match(/items=([0-9]+)\-(([0-9]+)||(Infinity))$/))  ){
        rangeFrom = tokens[1] - 0;
        rangeTo = tokens[2] - 0;
        if( rangeTo == 'Infinity' ){
          return ({
            from: rangeFrom
          })
        } else {

          limit =  rangeTo - rangeFrom + 1;

          return( {
            from: rangeFrom,
            to: rangeTo,
            limit:  limit,
          });

        }
      } 

      // Range headers not found or not valid, return null 
      return null;
    }


    function parseFilters( req ){

      var url_parts = url.parse( req.url, false );
      var q = url_parts.query || '';
      var result;

      result = querystring.decode( q );
      delete result.sortBy;

      return result;
    }      
  },



  // ****************************************************
  // *** INTERNAL FUNCTIONS, DO NOT TOUCH
  // ****************************************************


  _extrapolateDocAndprepareBeforeSendAll: function( request, method, docs, cb ){

    var self = this;

    var changeFunctions = [];

    docs.forEach( function( fullDoc, index ){

      changeFunctions.push( function( callback ){

        self.extrapolateDoc(  request, method, { fullDoc: fullDoc }, function( err, doc ){
          if( err ){
            callback( err, null );
          } else {

            self.prepareBeforeSend( request, method, { doc: doc }, function( err, doc ){
              if( err ){
                callback( err, null );
              } else {

                // Clean up doNotSave fields, which might end up there
                self.schema.cleanup( doc, 'doNotSave' );

                docs[ index ] = doc;

                callback( null, null );
              }
            });

          }
        });
      });
    }); // docs.forEach

    async.parallel( changeFunctions, cb );

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

  _sendErrorOnErr: function( request, err, next, cb ){
    if( err ) {
      this._sendError( request, next, err );
    } else {
      cb();
    }
  },

  _sendError: function( request, next, error ){

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

        var responseBody;

        // CASE #1: It's not an HTTP error and it's meant to chain non-HTTP errors: chain (call next)
        if( typeof( e[ error.name ] ) === 'undefined' && self.chainErrors === 'nonhttp' ){
           next( error );

        // CASE :2: Any other case. It might be an HTTP error or a JS error. Needs to handle both cases
        } else {

          // It's not an HTTP error: make up a new one, and incapsulate original error in it
          if( typeof( e[ error.name ] ) === 'undefined'  ){
            error = new self.ServiceUnavailableError( { originalErr: error } );
          } 

          // Make up the response body based on the error, and send it!
          responseBody =  self.formatErrorResponse( error );
          request._res.send( error.httpError, responseBody );
        }
      break;

    }
 
    self.logError( error );
  },

  _checkPermissionsProxy: function( request, method, p, cb ){

    // It's an API request: permissions are totally skipped
    if( !request.remote ) return cb( null, true );

    this.checkPermissions( request, method, p, cb );
  },

  _makePost: function( request, next ){

    var self = this;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePost && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }

    // Check the IDs
    self._checkParamIds( request, true, function( err ){  
      if( err ) return self._sendError( request, next, err );

      self.prepareBody( request, 'post', { }, function( err, body ){
        if( err ) return self._sendError( request, next, err );

        // Request is changed, old value is saved 
        request.originalbody = request.body;
        request.body = body;

        var skipParamsObject = {};
        skipParamsObject[ self.idProperty ] = [ 'required' ];
        self._enrichBodyWithParamIdsIfRemote( request );

        // Delete _children which mustn't be here regardless
        delete request.body._children;

        self.schema.validate( request.body, { skipParams: skipParamsObject, skipCast: [ self.idProperty ]  }, function( err, body, errors ){
          if( err ) return self._sendError( request, next, err );

          if( self.remote ){
            // Protected field are not allowed here
            for( var field in request.body ){
              if( self.schema.structure[ field ].protected && typeof( request.body[ field ] ) !== 'undefined'){
                errors.push( { field: field, message: 'Field not allowed because protected: ' + field + ' in ' + self.storeName } );
              }
            } 
          }

          request.body = body;

          if( errors.length ) return self._sendError( request, next, new self.UnprocessableEntityError( { errors: errors } ) );
 
          self.postValidate( request, 'post', {}, function( err ){
            if( err ) return self._sendError( request, next, err );
  
            // Actually check permissions
            self._checkPermissionsProxy( request, 'post', {}, function( err, granted ){
              if( err ) return self._sendError( request, next, err );
            
              if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );

              self.postCheckPermissions( request, 'post', {}, function( err ){
                if( err ) return self._sendError( request, next, err );
              
                // Clean up body from things that are not to be submitted
                self.schema.cleanup( request.body, 'doNotSave' );
              
                self.schema.makeId( request.body, function( err, generatedId){
                  if( err ) return self._sendError( request, next, err );
                                  
                  self.implementInsert( request, generatedId, function( err, fullDoc ){
                    if( err ) return self._sendError( request, next, err );

                    self.implementReposition( fullDoc, request.options.putBefore, request.options.putDefaultPosition, false, function( err ){
                      if( err ) return self._sendError( request, next, err );

                      self.postDbOperation( request, 'post', { fullDoc: fullDoc }, function( err ){
                      if( err ) return self._sendError( request, next, err );

                        self.extrapolateDoc( request, 'post', { fullDoc: fullDoc }, function( err, doc) {
                          if( err ) return self._sendError( request, next, err );
              
                          // Remote request: set headers, and send the doc back (if echo is on)
                          if( request.remote ){
                    
                            // Set the Location header if it was a remote request
                            request._res.setHeader( 'Location', request._req.originalUrl + doc[ self.idProperty ] );

                            if( self.echoAfterPost ){
          
                              self.prepareBeforeSend( request, 'post', { doc: doc }, function( err, doc ){
                                if( err ) return self._sendError( request, next, err );
                    
                                self.postEverything( request, 'post', { doc: doc, fullDoc: fullDoc }, function( err ){
                                  if( err ) return self._sendError( request, next, err );
               
                                  request._res.json( 201, doc );
               
                                }) 
                              }) 
        
                            } else {
                    
                              self.postEverything( request, 'post', { doc: doc, fullDoc: fullDoc }, function( err ){
                                if( err ) return self._sendError( request, next, err );
     
                                //request._res.send( 204, '' );
                                request._res.send( 201, '' );

                              });
                    
                            }
                    
                          // Local request: simply return the doc to the asking function
                          } else {
                  
                            self.prepareBeforeSend( request, 'post', { doc: doc }, function( err, doc ){
                              if( err ) return self._sendError( request, next, err );
              
                              self.postEverything( request, 'post', { doc: doc, fullDoc: fullDoc }, function( err ){
                                if( err ) return self._sendError( request, next, err );
                
                                next( null, doc );

                              });
                            });
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

  _makePut: function( request, next ){

    var self = this;
    var overwrite;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePut && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }

    // Check the IDs.
    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, next, err );

      self.prepareBody( request, 'put', { }, function( err, body ){
        if( err ) return self._sendError( request, next, err );

        // Request is changed, old value is saved 
        request.originalbody = request.body;
        request.body = body;

        self._enrichBodyWithParamIdsIfRemote( request );

        // Delete _children which mustn't be here regardless
        delete request.body._children;

        self.schema.validate( request.body, function( err, body, errors ) {
          if( err ) return self._sendError( request, next, err );

          if( self.remote){

            // Protected field are not allowed here
            for( var field in request.body ){
              if( self.schema.structure[ field ].protected && typeof( request.body[ field ] ) !== 'undefined'){
                errors.push( { field: field, message: 'Field not allowed because protected: ' + field + ' in ' + self.storeName } );
              }
            } 
          }

          request.body = body;
        
          if( errors.length ) return self._sendError( request, next, new self.UnprocessableEntityError( { errors: errors } ) );
   
          self.postValidate( request, 'put', {}, function( err ){
            if( err ) return self._sendError( request, next, err );
 
            // Fetch the doc
            self.implementFetchOne( request, function( err, fullDoc ){
              if( err ) return self._sendError( request, next, err );
              
              // Check the 'overwrite' option
              if( typeof( request.options.overwrite ) !== 'undefined' ){
                if( fullDoc && ! request.options.overwrite ){
                  self._sendError( request, next, new self.PreconditionFailedError() );
                } else if( !fullDoc && request.options.overwrite ) {
                  self._sendError( request, next, new self.PreconditionFailedError() );
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
                  self._checkPermissionsProxy( request, 'putNew', {}, function( err, granted ){
                    if( err ) return self._sendError( request, next, err );
            
                    if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );

                    self.postCheckPermissions( request, 'putNew', {}, function( err ){
                      if( err ) return self._sendError( request, next, err );

                      // Clean up body from things that are not to be submitted
                      // if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                      self.schema.cleanup( request.body, 'doNotSave' );
              
                      // Paranoid check
                      // Make sure that the id property in the body does match
                      // the one passed as last parameter in the list of IDs
                      request.body[ self.idProperty ] = request.params[ self.idProperty ];
                      
                      self.implementInsert( request, null, function( err, fullDoc ){
                        if( err ) return self._sendError( request, next, err );
              
                        self.implementReposition( fullDoc, request.options.putBefore, request.options.putDefaultPosition, false, function( err ){
                          if( err ) return self._sendError( request, next, err );

                          self.postDbOperation( request, 'putNew', { fullDoc: fullDoc }, function( err ){
                            if( err ) return self._sendError( request, next, err );

                            self.extrapolateDoc( request, 'putNew', { fullDoc: fullDoc }, function( err, doc) {
                              if( err ) return self._sendError( request, next, err );
                  
                              // Remote request: set headers, and send the doc back (if echo is on)
                              if( request.remote ){
                      
                                // Set the Location header if it was a remote request
                                request._res.setHeader( 'Location', request._req.originalUrl );
      
                                if( self.echoAfterPutNew ){
               
                                  self.prepareBeforeSend( request, 'putNew', { doc: doc }, function( err, doc){
                                    if( err ) return self._sendError( request, next, err );
      
                                    self.postEverything( request, 'putNew', { doc: doc, fullDoc: fullDoc, overwrite: request.options.overwrite }, function( err ){
                                      if( err ) return self._sendError( request, next, err );
       
                                      request._res.json( 201, doc );
                                    });
                                  });
                                } else {

                                  self.postEverything( request, 'putNew', { doc: doc, fullDoc: fullDoc, overwrite: request.options.overwrite }, function( err ){
                                    if( err ) return self._sendError( request, next, err );
      
                                    request._res.send( 201, '' );
                
                                  });
                                }
                  
                              // Local request: simply return the doc to the asking function
                              } else {
                                self.prepareBeforeSend( request, 'putNew', { doc: doc }, function( err, doc ){
                                  if( err ) return self._sendError( request, next, err );

                                  self.postEverything( request, 'putNew', { doc: doc, fullDoc: fullDoc, overwrite: request.options.overwrite }, function( err ){
                                    if( err ) return self._sendError( request, next, err );
                  
                                    next( null, doc );
                                  });
                                });
                              }
                            });
                          });
                        });
                      });
                    });
                  });
           
 
                // It's an EXISTING doc: it will need to be an update, _and_ permissions will be
                // done on inputted data AND existing doc
                } else {
        
                  self.extrapolateDoc( request, 'putExisting', { fullDoc: fullDoc }, function( err, doc) {
                    if( err ) return self._sendError( request, next, err );
            
                    // Actually check permissions
                    self._checkPermissionsProxy( request, 'putExisting', { doc: doc, fullDoc: fullDoc }, function( err, granted ){
                      if( err ) return self._sendError( request, next, err );
               
                      if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );

                      self.postCheckPermissions( request, 'putExisting', { doc: doc, fullDoc: fullDoc }, function( err ){
                        if( err ) return self._sendError( request, next, err );
                
                        // Clean up body from things that are not to be submitted
                        // if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                        self.schema.cleanup( request.body, 'doNotSave' );
                
                        self.implementUpdate( request, function( err, fullDocAfter ){
                          if( err ) return self._sendError( request, next, err );
            
                          self.implementReposition( fullDoc, request.options.putBefore, request.options.putDefaultPosition, true, function( err ){
                            if( err ) return self._sendError( request, next, err );
    
                            self.postDbOperation( request, 'putExisting', { fullDoc: fullDoc }, function( err ){
                              if( err ) return self._sendError( request, next, err );

                              self.extrapolateDoc( request, 'putExisting', { fullDoc: fullDocAfter }, function( err, docAfter ) {
                                if( err ) return self._sendError( request, next, err );
         
                                // Remote request: set headers, and send the doc back (if echo is on)
                                if( request.remote ){
                      
                                  // Set the Location header if it was a remote request
                                  request._res.setHeader( 'Location', request._req.originalUrl );
                         
                                  if( self.echoAfterPutExisting ){
                          
                                    self.prepareBeforeSend( request, 'putExisting', { doc: docAfter }, function( err, doc ){
                                      if( err ) return self._sendError( request, next, err );
                     
                                      self.postEverything( request, 'putExisting', { doc: doc, fullDoc: fullDoc, docAfter: docAfter, fullDocAfter: fullDocAfter, overwrite: request.options.overwrite }, function( err ) {
                                        if( err ) return self._sendError( request, next, err );
          
                                        request._res.json( 200, docAfter );
      
                                      });
                                    });
                  
                                  } else {

                                    self.postEverything( request, 'putExisting', { doc: doc, fullDoc: fullDoc, docAfter: docAfter, fullDocAfter: fullDocAfter, overwrite: request.options.overwrite }, function( err ) {
                                      if( err ) return self._sendError( request, next, err );
                    
                                      request._res.send( 200, '' );
                                      //res.send( 204, '' );
                 
                                    });
                                  }
                      
                                // Local request: simply return the doc to the asking function
                                } else {
                                  self.prepareBeforeSend( request, 'putExisting', { doc: docAfter }, function( err, doc ){
                                    if( err ) return self._sendError( request, next, err );
          
                                    self.postEverything( request, 'putExisting', { doc: doc, fullDoc: fullDoc, docAfter: docAfter, fullDocAfter: fullDocAfter, overwrite: request.options.overwrite }, function( err ) {
                                      if( err ) return self._sendError( request, next, err );
      
                                      next( null, docAfter );
      
                                    });
                                  });
                                }
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

  // Helper function for _makeGetQuery
  _validateSearchFilter: function( request, filters, options, cb ){

    var self = this;

    // If it's a remote call, then simply validate using the onlineSearchSchema
    if( request.remote ){
      return self.onlineSearchSchema.validate( filters, options, cb);
    }

    // If it's a local call, validate using a new schema made up with the onlineSearchSchema AND
    // the common schema merged together
    var schemaStructure = {};
    for( var k in self.onlineSearchSchema.structure ) schemaStructure[ k ] = self.onlineSearchSchema.structure[ k ];
    for( var k in self.schema.structure ) schemaStructure[ k ] = schemaStructure[ k ] || self.schema.structure[ k ];

    var newSchema = new self.onlineSearchSchema.constructor( schemaStructure );
    newSchema.validate( filters, options, cb );
  },

  _makeGetQuery: function( request, next ){

    var self = this;
    var sort, range, filters;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handleGetQuery && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }
  
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( request, true, function( err ){  
      if( err ) return self._sendError( request, next, err );
    
      self._checkPermissionsProxy( request, 'getQuery', {}, function( err, granted ){
        if( err ) return self._sendError( request, next, err );
    
        if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );
    
        self.postCheckPermissions( request, 'getQuery', {}, function( err ){
          if( err ) return self._sendError( request, next, err );

          self._validateSearchFilter( request, request.options.filters, { onlyObjectValues: true }, function( err, filters, errors ){
            if( err ) return self._sendError( request, next, err );

            // Actually assigning cast and validated filters to `options`
            request.options.filters = filters;

            // Errors in casting: give up, run away
            if( errors.length ) return self._sendError( request, next, new self.BadRequestError( { errors: errors } ));

            self.postValidate( request, 'getQuery', {}, function( err ){
              if( err ) return self._sendError( request, next, err );
          
              self.implementQuery( request, function( err, queryDocs, total, grandTotal ){
                if( err ) return self._sendError( request, next, err );

                self.postDbOperation( request, 'getQuery', { queryDocs: queryDocs }, function( err ){
                  if( err ) return self._sendError( request, next, err );

                  self._extrapolateDocAndprepareBeforeSendAll( request, 'getQuery', queryDocs, function( err ){
                    if( err ) return self._sendError( request, next, err );
              
                    self.postEverything( request, 'getQuery', { queryDocs: queryDocs }, function( err ) {
                      if( err ) return self._sendError( request, next, err );

                      // Remote request: set headers, and send the doc back (if echo is on)
                      if( request.remote ){

                        if( request.options.ranges ){
                          var from, to, of;
                          from = total ? request.options.ranges.from : 0;
                          to = total ? request.options.ranges.from + total - 1 : 0 ;
                          of = grandTotal;
                          request._res.setHeader('Content-Range', 'items ' + from + '-' + to + '/' + of );
                        }
                        request._res.json( 200, queryDocs );

                      // Local request: simply return the doc to the asking function
                      } else {
                        next( null, queryDocs );
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

    // Check that the method is implemented
    if( ! self.handleGet && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }

    // Check the IDs
    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, next, err );

      // Fetch the doc.
      self.implementFetchOne( request, function( err, fullDoc ){
        if( err ) return self._sendError( request, next, err );
    
        if( ! fullDoc ) return self._sendError( request, next, new self.NotFoundError());
    
        self.extrapolateDoc( request, 'get', { fullDoc: fullDoc }, function( err, doc) {
          if( err ) return self._sendError( request, next, err );
    
          // Check the permissions 
          self._checkPermissionsProxy( request, 'get', { doc: doc, fullDoc: fullDoc }, function( err, granted ){
            if( err ) return self._sendError( request, next, err );
        
            if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() ); 
        
            self.postCheckPermissions( request, 'get', { doc: doc, fullDoc: fullDoc }, function( err ){
              if( err ) return self._sendError( request, next, err );
          
              // "preparing" the doc. The same function is used by GET for collections 
              self.prepareBeforeSend( request, 'get', { doc: doc }, function( err, doc ){
                if( err ) return self._sendError( request, next, err );
          
                self.schema.cleanup( doc, 'doNotSave' );
          
                self.postEverything( request, 'get', { doc: doc, fullDoc: fullDoc }, function( err ) {
                  if( err ) return self._sendError( request, next, err );
                      
                  // Remote request: set headers, and send the doc back (if echo is on)
                  if( request.remote ){
          
                    // Send "prepared" doc
                    request._res.json( 200, doc );
          
                    // Local request: simply return the doc to the asking function
                  } else {
                     next( null, doc );
                  }
          
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
  
    // Check that the method is implemented
    if( ! self.handleDelete && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }
  
    // Check the IDs
    self._checkParamIds( request, false, function( err ){ 
      if( err ) return self._sendError( request, next, err );
    
      // Fetch the doc.
      self.implementFetchOne( request, function( err, fullDoc ){
        if( err ) return self._sendError( request, next, err );
    
        if( ! fullDoc ) return self._sendError( request, next, new self.NotFoundError());
    
        self.extrapolateDoc( request, 'delete', { fullDoc: fullDoc }, function( err, doc) {
          if( err ) return self._sendError( request, next, err );
        
          // Check the permissions 
          self._checkPermissionsProxy( request, 'delete', { doc: doc, fullDoc: fullDoc }, function( err, granted ){
            if( err ) return self._sendError( request, next, err );
        
            if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );

            self.postCheckPermissions( request, 'delete', { doc: doc, fullDoc: fullDoc }, function( err ){
              if( err ) return self._sendError( request, next, err );
                  
              // Actually delete the document
              self.implementDelete( request, function( err ){
                if( err ) return self._sendError( request, next, err );

                self.postDbOperation( request, 'delete', { fullDoc: fullDoc }, function( err ){
                  if( err ) return self._sendError( request, next, err );

                  // Remote request: send a 204 (contents) or 201 (no contents) back
                  if( request.remote ){

                    if( self.echoAfterDelete ){

                      self.prepareBeforeSend( request, 'delete', { doc: doc }, function( err, doc ){
                        if( err ) return self._sendError( request, next, err );
            
                        self.postEverything( request, 'delete', { doc: doc, fullDoc: fullDoc }, function( err ){
                          if( err ) return self._sendError( request, next, err );
       
                          request._res.json( 201, doc );
       
                        }) 
                      }) 

                    } else {
            
                      self.postEverything( request, 'delete', { doc: doc, fullDoc: fullDoc }, function( err ){
                        if( err ) return self._sendError( request, next, err );

                        request._res.send( 204, '' );
                        //request._res.send( 201, '' );

                      });
            
                    }
                    
                  // Local request: simply return the doc's ID to the asking function
                  } else {
                    next( null, doc );
                  }

                });
              });
            });
          });
        });
      });
    });
  },



// ****************************************************
// *** HTTP REQUEST HANDLER
// ****************************************************
  
  getRequestHandler: function( action ){

    var self = this;

    if( [ 'Get', 'GetQuery', 'Put', 'Post', 'Delete' ].indexOf( action ) === -1 ){
      throw( new Error("action can be Get, GetQuery, Put, Post, Delete") );
    }

    return function( req, res, next ){

      var request = new Object();
  
      // It's definitely remote
      request.remote = true;

      // Sets the request's _req and _res variables
      request._req = req;
      request._res = res;

      // Set the params and body options, copying them from `req`
      request.params = {}; for( var k in req.params) request.params[ k ] = req.params[ k ];
      request.body = {}; for( var k in req.body) request.body[ k ] = req.body[ k ];

      // Since it's an online request, options are set by "req"
      // This will set things like ranges, sort options, etc.
      try {
        request.options = self._initOptionsFromReq( action, req );
      } catch( e ){
        return next( e );
      }

      // The "delete" option can apply to GetQuery
      if( action === 'GetQuery' ){
        request.options.delete = !!self.deleteAfterGetQuery;
      }

      if(Store.artificialDelay ) {
        setTimeout( function(){
          // Actually run the request
          self['_make' + action ]( request, next );
        }, Store.artificialDelay );
      } else {
        self['_make' + action ]( request, next );
      }

    }
  },
 
  setAllRoutes: function( app, urlParameter ){

    var url = urlParameter || this.publicURL;
    var idName;

    // Public URL must be set
    if( ! url ){
      throw( new Error( "setAllRoutes must be called on a store with a public URL" ) );
    }

    // OK, everything is dandy: work out base URL and id, and create the Express routes
    //
    // First, look for the last /some/:word in the URL
    var idName = url.match( /:\w*$/ );
    if( ! idName ){
      throw( new Error("A store's URL needs to end with a :columned token representing its ID, this is not valid: " + url ) );
    } else {
      // Found it: normalise it to a simple string rather than the 1 element array we received
      idName = idName[0];
    }

    url = url.replace( /:\w*$/, '');

    // Make entries in "app", so that the application
    // will give the right responses
    app.get(      url + idName, this.getRequestHandler( 'Get' ) );
    app.get(      url,          this.getRequestHandler( 'GetQuery') );
    app.put(      url + idName, this.getRequestHandler( 'Put') );
    app.post(     url,          this.getRequestHandler( 'Post') );
    app.delete(   url + idName, this.getRequestHandler( 'Delete') );
  },

  // ****************************************************
  // *** API (REST FUNCTIONS AS OBJECT METHODS)
  // ****************************************************

  apiGet: function( id, options, next){

    // Make `options` argument optional
    var len =  arguments.length;

    if( len == 2 ) { next = options; options = {}; };

    var request = new Object();

    request.remote = false;
    request.body = {};
    request.options = options;

    // Make up "params" to be passed to the _makeGet function
    request.params = {};
    //request.params[ this._lastParamId() ] = id;
    request.params[ this.idProperty ] = id;

    // Actually run the request
    this._makeGet( request, next );

  },



  apiGetQuery: function( options, next ){


    // Make up the request
    var request = new Object();

    request.remote = false;
    request.body = {};
    request.params = {};
    request.options = options;

    // Actually run the request
    this._makeGetQuery( request, next );

  },

  apiPut: function( id, body, options, next ){

    var Class = this;

    // Make `options` argument optional
    var len =  arguments.length;
    if( len == 3 ) { next = options; options = {}; };

    // Make up the request
    var request = new Object();
    request.remote = false;
    request.body = body;
    request.options = options;

    delete body._children;

    // Sets only idProperty in the params hash. Note that
    // you might well decide to pass the whole object in body, and
    // pass `null` as the object ID: in that case, this function
    // will sort out `params` with the `id` set
    request.params = {};
    if( id !== null ){
      request.params[ this.idProperty ] = id;
      request.body[ this.idProperty ] = id;
    } else {
      var idInBody = body[ this.idProperty ];
      if( typeof( idInBody ) !== 'undefined'){
        request.params[ this.idProperty ] = body[ this.idProperty ];
      } else {
        throw( new Error("When calling Store.Put with an ID of null, id MUST be in body") );
      }
    }

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
    request.body = body;
    request.options = options;
    request.params = {};

    delete body._children;

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

    // Make up "params" to be passed to the _makeDelete function
    request.params = {};
    //request.params[ this._lastParamId() ] = id;
    request.params[ this.idProperty ] = id;

    // Actually run the request
    this._makeDelete( request, next );
  },

 
});


// Get store from the class' registry
Store.getStore = function( storeName ){
  return Store.registry[ storeName ];
}

// Get store from the class' registry
Store.deleteStore = function( storeName ){
  delete Store.registry[ storeName ];
}


// Get all stores as a hash
Store.getAllStores = function(){
  return Store.registry;
}

// OneFieldStoreMixin, to create a one-field store based
// on a "main" parent store

Store.OneFieldStoreMixin = declare( null,  {

  // Variables that HAVE TO be set by the inherited constructor
  storeName: null,
  collectionName: null,
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
  extrapolateDoc: function( request, method, p, cb ){ cb( null, p.fullDoc ); },
  prepareBeforeSend: function( request, method, p, cb ){ cb( null, p.doc ); },
  prepareBody: function( request, body, method, cb ){ cb( null, request.body ); },
  
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

    // Check that the method is implemented
    if( ! self.handleGet && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }

    // Check the IDs
    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, next, err );

      // Fetch the doc.
      self.implementFetchOne( request, function( err, fullDoc ){
        if( err ) return self._sendError( request, next, err );
    
        if( ! fullDoc ) return self._sendError( request, next, new self.NotFoundError());

        // Manipulate fullDocAfter: at this point, it's the WHOLE database record,
        // whereas I only want returned paramIds AND the piggyField
        for( var field in fullDoc ){
          if( ! self.paramIds[ field ] && field != self.piggyField ) delete fullDoc[ field ];
        }

        self.extrapolateDoc( request, 'get', { fullDoc: fullDoc }, function( err, doc) {
          if( err ) return self._sendError( request, next, err );
    
          // Check the permissions 
          self._checkPermissionsProxy( request, 'get', { doc: doc, fullDoc: fullDoc }, function( err, granted ){
            if( err ) return self._sendError( request, next, err );
        
            if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() ); 

            self.postCheckPermissions( request, 'get', { doc: doc, fullDoc: fullDoc }, function( err ){
              if( err ) return self._sendError( request, next, err );
             
              // "preparing" the doc. The same function is used by GET for collections 
              self.prepareBeforeSend( request, 'get', { doc: doc }, function( err, doc ){
                if( err ) return self._sendError( request, next, err );
          
                self.postEverything( request, 'get', { doc: doc, fullDoc: fullDoc }, function( err ) {
                  if( err ) return self._sendError( request, next, err );
                      
                  // Remote request: set headers, and send the doc back (if echo is on)
                  if( request.remote ){
          
                    // Send "prepared" doc
                    request._res.json( 200, doc );
          
                    // Local request: simply return the doc to the asking function
                  } else {
                     next( null, doc );
                  }
          
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

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePut && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }

    // DETOUR: It's a reposition. Not allowed here!
    if( typeof( request.options.putBefore ) !== 'undefined' ){
      return cb( new Error("Option putBefore not allowed in OneFieldStore"));
    }
 
    // Check the IDs.

    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, next, err );

      self.prepareBody( request, 'putExisting', { }, function( err, body ){
        if( err ) return self._sendError( request, next, err );

        // Request is changed, old value is saved 
        request.originalbody = request.body;
        request.body = body;

        self._enrichBodyWithParamIdsIfRemote( request );
        
        self.schema.validate( request.body, { onlyObjectValues: true }, function( err, body, errors ) {
          if( err ) return self._sendError( request, next, err );

          // Go through each field in body, and check that it's either
          // a paramId OR piggyField
          // After this, body will be validated with { onlyObjectValues }
          for( var field in request.body ){
            if( self.paramIds.indexOf( field ) == -1 && field != self.piggyField ){
              errors.push( { field: field, message: 'Field not allowed because not a paramId nor the piggyBack field: ' + field + ' in ' + self.storeName } );
            }
          }

          if( errors.length ) return self._sendError( request, next, new self.UnprocessableEntityError( { errors: errors } ) );

          // request is changed, old value is saved (again!)
          request.bodyBeforeValidation = request.body;
          request.body = body;
      
          self.postValidate( request, 'putExisting', {}, function( err ){
            if( err ) return self._sendError( request, next, err );
    
            // Fetch the doc
            self.implementFetchOne( request, function( err, fullDoc ){
              if( err ) return self._sendError( request, next, err );     
             
              // OneFieldStores will only ever work on already existing records
              if( ! fullDoc ){
                return self._sendError( request, next, new self.NotFoundError());
              }         

              // Manipulate fullDoc: at this point, it's the WHOLE database record,
              // whereas I only want returned paramIds AND the piggyField
              for( var field in fullDoc ){
                if( self.paramIds.indexOf( field ) == -1 && field != self.piggyField ) delete fullDoc[ field ];
              }
                
              self.extrapolateDoc( request, 'putExisting', { fullDoc: fullDoc }, function( err, doc) {
                if( err ) return self._sendError( request, next, err );
          
                // Actually check permissions
                self._checkPermissionsProxy( request, 'putExisting', { doc: doc, fullDoc: fullDoc }, function( err, granted ){
                  if( err ) return self._sendError( request, next, err );
             
                  if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );

                  self.postCheckPermissions( request, 'putExisting', { doc: doc, fullDoc: fullDoc }, function( err ){
                    if( err ) return self._sendError( request, next, err );
               
                    self.implementUpdate( request, function( err, fullDocAfter ){
                      if( err ) return self._sendError( request, next, err );

                      // Manipulate fullDoc: at this point, it's the WHOLE database record,
                      // whereas I only want returned paramIds AND the piggyField
                      for( var field in fullDocAfter ){
                        if( self.paramIds.indexOf( field ) == -1 && field != self.piggyField ) delete fullDocAfter[ field ];
                      }

                      self.postDbOperation( request, 'putExisting', { fullDoc: fullDoc }, function( err ){
                        if( err ) return self._sendError( request, next, err );

                        self.extrapolateDoc( request, 'putExisting', { fullDoc: fullDocAfter }, function( err, docAfter ) {
                          if( err ) return self._sendError( request, next, err );

                          // Remote request: set headers, and send the doc back (if echo is on)
                          if( request.remote ){
              
                            // Set the Location header if it was a remote request
                            request._res.setHeader( 'Location', request._req.originalUrl );
                 
                            if( self.echoAfterPutExisting ){
                  
                              self.prepareBeforeSend( request, 'putExisting', { doc: docAfter }, function( err, doc ){
                                if( err ) return self._sendError( request, next, err );
             
                                self.postEverything( request, 'putExisting', { doc: doc, fullDoc: fullDoc, docAfter: docAfter, fullDocAfter: fullDocAfter, overwrite: true }, function( err ) {
                                  if( err ) return self._sendError( request, next, err );

                                  request._res.json( 200, docAfter );

                                });
                              });
          
                            } else {
                
                              self.postEverything( request, 'putExisting', { doc: doc, fullDoc: fullDoc, docAfter: docAfter, fullDocAfter: fullDocAfter, overwrite: true }, function( err ) {
                                if( err ) return self._sendError( request, next, err );
            
                                request._res.send( 200, '' );
                                //res.send( 204, '' );
         
                              });
                            }
              
                          // Local request: simply return the doc to the asking function
                          } else {
                            self.prepareBeforeSend( request, 'putExisting', { doc: docAfter }, function( err, doc ){
                              if( err ) return self._sendError( request, next, err );


                              self.postEverything( request, 'putExisting', { doc: doc, fullDoc: fullDoc, docAfter: docAfter, fullDocAfter: fullDocAfter, overwrite: true }, function( err ) {
                                if( err ) return self._sendError( request, next, err );

                                next( null, docAfter ); 
                              });
                            });
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
  },

  postEverything: function postEverything( request, method, p, done){
    var self = this;

    this.inheritedAsync( postEverything, arguments, function( err ){
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

