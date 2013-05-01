var 
  dummy
, e = require('allhttperrors')
, declare = require('simpledeclare')
, Schema = require('simpleschema')
, url = require('url')
, async = require('async')
;


var Store = declare( null,  {

  paramIds: [ ],
  ignoreIds: [ ],

  schema: null,
  idProperty: null,

  storeName: null,

  queryFilterType: 'and',
 
  handlePut: true,
  handlePost: true,
  handlePostAppend: true,
  handleGet: true,
  handleGetQuery: true,
  handleDelete: true,

  echoAfterPutNew: true,
  echoAfterPutExisting: false,
  echoAfterPost: true,
  echoAfterPostAppend: false,

  // Default error objects which might be used by this module.
  BadRequestError: e.BadRequestError,
  UnauthorizedError: e.UnauthorizedError,
  ForbiddenError: e.ForbiddenError,
  NotFoundError: e.NotFoundError,
  PreconditionFailedError: e.PreconditionFailedError,
  UnprocessableEntityError: e.UnprocessableEntityError,
  NotImplementedError: e.NotImplementedError,
  ServiceUnavailableError: e.ServiceUnavailableError,

  chainErrors: 'none', 


  driverInit: function(){

  },

  constructor: function(){

    var self = this;

    // Sets proto.paramId, which (as for the principle of 
    // least surprise) must be the last paramId passed to
    // the store.
    this.idProperty = self._lastParamId();


    // JAVASCRIPT WARNING == READ AND UNDERSTAND THIS
    // ----------------------------------------------
    // The schema here is taken, and manipulated. This
    // constructor is run every time a new object is created.
    // However, this manipulation only needs to happen once, as
    // the schema data lives in the PROTOTYPE (and it's therefore
    // shared by all derived objects).
    // Note that the created `paramsSchema` is stores in the self.schema,
    // object itself.
    // If you derive a store from another, and redefine `stores` in the
    // prototype, this code will re-run for (once) when you instance
    // a new object using the derived constructor.
    //
    // If a derived class wants to change `paramIds`, it
    // will need to redefine the schema in order for this
    // init code to actually run

    // The schema hasn't been analysed before
    if( ! self.schema.analysed ){

      self.schema.analysed = true;

      // `paramsSchema` is a secondary schema used for all parameter in paramIds.
      // It's stored in the prototype, on the same level as `schema`
      self.schema.paramsSchema = new self.schema.constructor( {} );

      // Add the idProperty using the self.allDbDefaultParamIdsDef() if it wasn't
      // defined
      if( typeof( self.schema.structure[ self.idProperty ] ) === 'undefined'){
        self.schema.structure[ self.idProperty ] = self.defaultParamIdsDef();
      }

      // Populate the paramsSchema schema, either with IDs defined in
      // the main schema (which will be _moved_) or defining them as
      // self.defaultParamIdsDef()
      self.paramIds.forEach( function( k ) {

        // If it's in the main schema's structure...
        if( typeof( self.schema.structure[ k ] ) !== 'undefined' ){
          // Move it to the paramsSchema structure
          self.schema.paramsSchema.structure[ k ] = self.schema.structure[ k ];
          if( k != self.idProperty ) delete self.schema.structure[ k ];
        } else {
          // Otherwise, create it in the paramsSchema structure,
          // using the creator self.defaultParamIdsDef()
          self.schema.paramsSchema.structure[ k ] = self.defaultParamIdsDef();
        }

      });
    }

    // Initialise the driver
    self.driverInit();
  },


  // *** DB manupulation functions (to be overridden by inheriting classes) ***

  extrapolateDoc: function( body, params, options, fullDoc, cb ){
    cb( null, fullDoc );
  },

  prepareBeforeSend: function( doc, cb ){
    cb( null, doc );
  },


  // NOT STRICTLY DRIVER FUNCTIONS, BUT NEARLY ALWAYS
  // REDEFINED BY DRIVERS
  defaultParamIdsDef: function(){
    return { type: 'number', isRequired: true, searchable: true  };
  },

  // The default id maker (just return an ObjectId )
  makeId: function( object, cb ){
    cb( null, Math.floor(Math.random()*10000) );
  },




  // DRIVER FUNCTIONS

  driverAllDbFetch: function( body, params, options, cb ){
    var doc = { id: 'id', dummyData: 'value'};
    cb( null, doc );
  }, 

  driverGetDbQuery: function( body, params, options, cb ){
    cb( null, [{ id: 'id1', dummyData: 'value1'}, { id: 'id2', dummyData: 'value2'} ] );
  },

  driverPutDbInsert: function( body, params, options, cb ){
    cb( null, body );
  },

  driverPutDbUpdate: function( body, params, options, doc, fullDoc, cb ){
    cb( null, doc );
  },

  driverPostDbInsertNoId: function(body, params, options, generatedId, cb ){
    cb( null, body );
  },

  driverPostDbAppend: function( body, params, options, doc, fullDoc, cb ){
    cb( null, doc );
  },

  driverDeleteDbDo: function( body, params, options, id, cb ){
    cb( null );
  },



  formatErrorResponse: function( error ){

    if( error.errors ){
      return { message: error.message, errors: error.errors }
    } else {
      return { message: error.message }
    }
  },

  logError: function( error ){
  },


  // *** "after" calls ***
  afterPutNew: function( body, params, options, doc, fullDoc, overwrite, cb ){
    cb( null )
  },
  afterPutExisting: function( body, params, options, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){
    cb( null )
  },

  afterPost: function( body, params, options, doc, fullDoc, cb){
    cb( null );
  },

  afterPostAppend: function( body, params, options, doc, fullDoc, docAfter, fullDocAfter, cb ){
    cb( null );
  },

  afterDelete: function( body, params, options, doc, fullDoc, cb ){
    cb( null );
  },

  afterGet: function( body, params, options, doc, fullDoc, cb ) {
    cb( null );
  },

  // *** Internal, protected calls that should't be changed by users ***

  _clone: function( obj ){
    return  JSON.parse( JSON.stringify( obj ) );
  },


  _extrapolateAndPrepareAll: function( body, params, options, docs, cb ){

    var self = this;


    var changeFunctions = [];
    docs.forEach( function( fullDoc, index ){

      changeFunctions.push( function( callback ){

        self.extrapolateDoc(  body, params, options, fullDoc, function( err, extrapolatedDoc ){
          if( err ){
            callback( err, null );
          } else {

            self.prepareBeforeSend( extrapolatedDoc, function( err, preparedDoc ){
              if( err ){
                callback( err, null );
              } else {
                docs[ index ] = preparedDoc;
                callback( null, null );
              }
            })

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
  // paramsSchema
  _checkParamIds: function( params, errors, skipIdProperty ){
    var self = this;
    var fakeRecord = {}, castOptions = {};

    // This shouldn't happen
    if( self.paramIds.length === 0 ) return;
 
    // This is to optimise a little: if there is only
    // one self.paramIds and skipIdProperty is on,
    // the resulting fakeRecord would be empty and
    // this would be a big waste of time
    if( self.paramIds.length === 1 && skipIdProperty ) return;

    // Create the fake record I will cast against
    self.paramIds.forEach( function( k ){

      // Avoid copying over the idProperty if it's to be skipped
      if( skipIdProperty && k == self.idProperty ) return; // LOCAL return

      // If there is a missing ID in params, add to `errors` and
      // skip it. Note: I don't want to trust the presence of the "required"
      // parameter for an id for this check to happen
      if( typeof( params[ k ] ) === 'undefined' ){
        errors.push( { field: k, message: 'Missing ID in URL: ' + k, mustChange: false } );
        return; // LOCAL return
      }

      // At this point, all is well
      fakeRecord[ k ] = params[ k ];
    });

    // If `errors` has... well, errors, then there were missing IDs and the
    // URL is broken. No point in continuing
    if( errors.length != 0 ) return;

    // Actually cast/check the temporary (id-only) object, making
    // sure that self.idProperty IS in the skipList if skipIdProperty
    // is trye
    if( skipIdProperty ) castOptions.skipCast = [ self.idProperty ];
    self.schema.paramsSchema.apply( fakeRecord, errors, castOptions );
 
    // Copy those casted value back onto the params, so that
    // other store calls will have ready-to-use cast
    // elements in `params`
    self.paramIds.forEach( function( k ){
      if( typeof( fakeRecord[ k ] ) !== 'undefined' ) params[ k ] = fakeRecord[ k ];
    });

  },

  _ignoredId: function( id ){
    return ( Array.isArray( this.ignoreIds ) && this.ignoreIds.indexOf( id ) != -1 );
  },
 
  _sendErrorOnErr: function( err, next, cb ){
    if( err ) {
      this._sendError( next, err );
    } else {
      cb();
    }
  },


  _sendError: function( next, error ){

    var self = this;

    // It's a local call: simply call the callback passed by the caller
    if( ! self.remote ){
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
          self._res.send( error.httpError, responseBody );
        }
      break;

    }
 
    self.logError( error );
  },

  // *** The real dance ***

  _makePost: function( body, params, options, next ){

    var self = this;
    var errors = [];
    var body;

    // Check that the method is implemented
    if( ! self.handlePost ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( params, errors, true );
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors }  ) );
      return;
    }
  
    //body = self._clone( body );
 
    // Do schema cast and check
    if( self.schema !== null ){
      self.schema.apply(  body, errors, { notRequired: [ self.idProperty ], skipCast: [ self.idProperty ]  } );
    }

    var validateFunction = function( body, errors, cb ) { cb( null ) }
    if( typeof( self.schema ) !== 'undefined' ){ validateFunction = self.schema.validate; }


    validateFunction.call( self.schema, body,  errors, function( err ){
      self._sendErrorOnErr( err, next, function(){

        if( errors.length ){
          self._sendError( next, new self.UnprocessableEntityError( { errors: errors } ) );
        } else {

          // Actually check permissions
          self.checkPermissionsPost( body, params, options, function( err, granted ){
            self._sendErrorOnErr( err, next, function(){

              if( ! granted ){
                self._sendError( next, new self.ForbiddenError() );
              } else {

                // Clean up body from things that are not to be submitted
                if( self.schema ) self.schema.cleanup( body, 'doNotSave' );

                self.makeId( body, function( err, generatedId){
                  self._sendErrorOnErr( err, next, function(){


                    self.driverPostDbInsertNoId( body, params, options, generatedId, function( err, fullDoc ){
                      self._sendErrorOnErr( err, next, function(){

                        self.extrapolateDoc( body, params, options, fullDoc, function( err, doc) {
                          self._sendErrorOnErr( err, next, function(){


                            self.afterPost( body, params, options, doc, fullDoc, function( err ){
                              self._sendErrorOnErr( err, next, function(){

                                // Remote request: set headers, and send the doc back (if echo is on)
                                if( self.remote ){

                                  // Set the Location header if it was a remote request
                                  self._res.setHeader( 'Location', self._req.originalUrl + doc[ self.idProperty ] );
                                  if( self.echoAfterPost ){
                                    self.prepareBeforeSend( doc, function( err, doc ){
                                      self._res.json( 201, doc );
                                    })
                                  } else {
                                    self._res.send( 201, '' );
                                  }

                                // Local request: simply return the doc to the asking function
                                } else {
                                  next( null, doc, self.idProperty );
                                } 

                              }) // err
                            }) // self.afterPost
                       
                          }) // err
                        }) // self.extrapolateDoc

                      }) // err
                    }) // driverPostDbInsertNoId

                  }) // err
                }) // self.makeId

              } // granted

            }) // err
          }) // checkPermissionsPost

        } // errors.length

      }) // err
    }) // validate()


  },

  _makePostAppend: function( body, params, options, next ){

    var self = this;
    var errors = [];
    var body;

    // Check that the method is implemented
    if( ! self.handlePostAppend ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( params, errors );
    if( errors.length ){
      self._sendError( next, self.BadRequestError( { errors: errors } ) );
      return;
    }
   
    //body = self._clone( req.body );

    // Do schema cast and check
    if( self.schema !== null ){
      self.schema.apply(  body, errors );
    }
 
    var validateFunction = function( body, errors, cb ) { cb( null ) }
    if( typeof( self.schema ) !== 'undefined' ){ validateFunction = self.schema.validate; }

    validateFunction.call( self.schema, body,  errors, function( err ){
      self._sendErrorOnErr( err, next, function(){

        if( errors.length ){
          self._sendError( next, new self.UnprocessableEntityError( { errors: errors } ) );
        } else {
          // Fetch the doc
          self.driverAllDbFetch( body, params, options, function( err, fullDoc ){
            self._sendErrorOnErr( err, next, function(){

              // Get the extrapolated doc
              self.extrapolateDoc( body, params, options, fullDoc, function( err, doc ){
                self._sendErrorOnErr( err, next, function(){

                  // Actually check permissions
                  self.checkPermissionsPostAppend( body, params, options, doc, fullDoc, function( err, granted ){
                    self._sendErrorOnErr( err, next, function(){

                      if( ! granted ){
                        self._sendError( next, new self.ForbiddenError() );
                      } else {

                        // Clean up body from things that are not to be submitted
                        if( self.schema ) self.schema.cleanup( body, 'doNotSave' );

                        // Paranoid check
                        // Make sure that the id property in the body does match
                        // the one passed as last parameter in the list of IDs
                        body[ self.idProperty ] = params[ self.idProperty ];

                        self.driverPostDbAppend( body, params, options, doc, fullDoc, function( err, fullDocAfter ){
                          self._sendErrorOnErr( err, next, function(){
  
                            self.extrapolateDoc( body, params, options, fullDoc, function( err, docAfter ){
                              self._sendErrorOnErr( err, next, function(){

                                self.afterPostAppend( body, params, options, doc, fullDoc, docAfter, fullDocAfter, function( err ){
                                  self._sendErrorOnErr( err, next, function(){

                                    // Remote request: set headers, and send the doc back (if echo is on)
                                    if( self.remote ){
                                      if( self.echoAfterPostAppend ){
                                         self.prepareBeforeSend( docAfter, function( err, docAfter ){
                                           self._res.json( 200, docAfter );
                                         })
                                      } else { 
                                        self._res.send( 204, '' );
                                      }

                                    // Local request: simply return the doc to the asking function
                                    } else {
                                      next( null, docAfter, self.idProperty );
                                    }

                                  }) // err
                                }) // self.afterPostAppend

                              }) // err
                            }); // self.extrapolateDoc

                          }) // err
                        }) // driverPostDbAppend

                      } // granted


                    }) // err
                  }) // extrapolateDoc 

                }) // err
              }) // driverAllDbFetch

            }) // err
          }) // checkPermissionsPostAppend
   
        } // errors.length

      }) // err
    }) // self.validate

  },


  _makePut: function( body, params, options, next ){

    var self = this;
    var errors = [];
    var overwrite;
    var body;

    // Check that the method is implemented
    if( ! self.handlePut ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( params, errors );
    if( errors.length ){
      self._sendError( next, self.BadRequestError( { errors: errors }  ) );
      self._return;
    }
    
    // body = self._clone( req.body );

    // Do schema cast and check
    if( self.schema !== null ){
      self.schema.apply(  body, errors );
    }

    var validateFunction = function( body, errors, cb ) { cb( null ) }
    if( typeof( self.schema ) !== 'undefined' ){ validateFunction = self.schema.validate; }

    validateFunction.call( self.schema, body,  errors, function( err ){
      self._sendErrorOnErr( err, next, function(){

        if( errors.length ){
          self._sendError( next, new self.UnprocessableEntityError( { errors: errors } ) );
        } else {

          // Fetch the doc
          self.driverAllDbFetch( body, params, options, function( err, fullDoc ){
            self._sendErrorOnErr( err, next, function(){
  
 
              // Check the 'overwrite' option
              if( typeof( options.overwrite ) !== 'undefined' ){
                if( fullDoc && ! options.overwrite ){
                  self._sendError( next, new self.PreconditionFailedError() );
                } else if( !fullDoc && options.overwrite ) {
                  self._sendError( next, new self.PreconditionFailedError() );
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
                  self.checkPermissionsPutNew( body, params, options, function( err, granted ){
                    self._sendErrorOnErr( err, next, function(){


                      if( ! granted ){
                        self._sendError( next, new self.ForbiddenError() );
                      } else {

                        // Clean up body from things that are not to be submitted
                        if( self.schema ) self.schema.cleanup( body, 'doNotSave' );

                        // Paranoid check
                        // Make sure that the id property in the body does match
                        // the one passed as last parameter in the list of IDs
                        body[ self.idProperty ] = params[ self.idProperty ];

                        self.driverPutDbInsert( body, params, options, function( err, fullDoc ){
                          self._sendErrorOnErr( err, next, function(){

                            // Update "doc" to be the complete version of the doc from the DB
                            self.extrapolateDoc( body, params, options, fullDoc, function( err, doc ){
                              self._sendErrorOnErr( err, next, function(){

                                self.afterPutNew( body, params, options, doc, fullDoc, options.overwrite, function( err ){
                                  self._sendErrorOnErr( err, next, function(){

                                    // Remote request: set headers, and send the doc back (if echo is on)
                                    if( self.remote ){

                                      // Set the Location header if it was a remote request
                                      self._res.setHeader( 'Location', self._req.originalUrl + doc[ self.idProperty ] );
                                      if( self.echoAfterPutNew ){
                                        self.prepareBeforeSend( doc, function( err, doc ){
                                          res.json( 201, doc );
                                        })
                                      } else {
                                        res.send( 201, '' );
                                      }

                                    // Local request: simply return the doc to the asking function
                                    } else {
                                      next( null, doc, self.idProperty );
                                    }

                                  }) // err
                                }) // self.afterPutNew

                              }) // err
                            }) // self.extrapolateDoc
                        
                          }) // err
                        }) // driverPutDbInsert

                      } // granted

                    }) // err
                  }) // checkPermissionsPutNew


                // It's an EXISTING doc: it will need to be an update, _and_ permissions will be
                // done on inputted data AND existing doc
                } else {

                  self.extrapolateDoc( body, params, options, fullDoc, function( err, doc ){
                    self._sendErrorOnErr( err, next, function(){

                      // Actually check permissions
                      self.checkPermissionsPutExisting( body, params, options, doc, fullDoc, function( err, granted ){
                        self._sendErrorOnErr( err, next, function(){

                          if( ! granted ){
                            self._sendError( next, new self.ForbiddenError() );
                          } else {

                            // Clean up body from things that are not to be submitted
                            if( self.schema ) self.schema.cleanup( body, 'doNotSave' );

                            self.driverPutDbUpdate( body, params, options, doc, fullDoc, function( err, fullDocAfter ){
                              self._sendErrorOnErr( err, next, function(){

                                // Update "doc" to be the complete version of the doc from the DB
                                self.extrapolateDoc( body, params, options, fullDocAfter, function( err, docAfter ){
                                  self._sendErrorOnErr( err, next, function(){

                                    // Remote request: set headers, and send the doc back (if echo is on)
                                    if( self.remote ){

                                      // Set the Location header if it was a remote request
                                      self._res.setHeader( 'Location', self._req.originalUrl + doc[ self.idProperty ] );
                                      self.afterPutExisting( body, params, options, doc, docAfter, fullDoc, fullDocAfter, options.overwrite, function( err ) {
                                        self._sendErrorOnErr( err, next, function(){

                                          if( self.echoAfterPutExisting ){
                                            self.prepareBeforeSend( docAfter, function( err, docAfter ){
                                              self._res.json( 200, docAfter );
                                            })
                                          } else {
                                            self._res.send( 200, '' );
                                            //res.send( 204, 'OK' );
                                          }
                                        }) // err
                                      }) // self.afterPutExisting

                                    // Local request: simply return the doc to the asking function
                                    } else {
                                      next( null, doc, self.idProperty );
                                    }

                                  }) // err
                                }) // self.extrapolateDoc

                              }) // err
                            }) // self.driverPutDbUpdate

                          } // granted

                        }) // err
                      }) // self.checkPermissionsPutExisting

                    }) // err
                  }) // self.extrapolateDoc
                }

              } // function continueAfterFetch()
    
            }) // err
          }) // driverAllDbFetch

        } // if errors.length  

      }) // err 
    }) // validateFunction

  },

  _makeGetQuery: function( body, params, options, next ){

    var self = this;
    var errors = [];
    var sortBy, range, filters;


    // Check that the method is implemented
    if( ! self.handleGetQuery ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( params, errors, true );
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors } ) );
      return;
    }
    
    // The schema must be defined for queries. It's too important, as it defines
    // what's searchable and what's sortable
    if( self.schema == null ){
      self._sendError( next, new Error('Query attempted on schema-less store' ) );
      return;
    }

    sortBy = options.sortBy;
    ranges = options.ranges;
    if( typeof( ranges ) === 'undefined' ) ranges = {};
    if( typeof( ranges.rangeFrom ) === 'undefined' ) ranges.rangeFrom = 0;
    if( typeof( ranges.rangeTo )   === 'undefined' ) ranges.rangeTo   = 0;
    filters = options.flters;

    // console.log( sortBy );
    // console.log( ranges );
    // console.log( filters );
   
    self.driverGetDbQuery( body, params, options, function( err, queryDocs ){
      self._sendErrorOnErr( err, next, function(){

        self._extrapolateAndPrepareAll( body, params, options, queryDocs, function( err ){
          self._sendErrorOnErr( err, next, function(){

            // Remote request: set headers, and send the doc back (if echo is on)
            if( self.remote ){
              self._res.setHeader('Content-Range', 'items ' + ranges.rangeFrom + '-' + ranges.rangeTo + '/' + queryDocs.total );
              self._res.json( 200, queryDocs );
            // Local request: simply return the doc to the asking function
            } else {
              next( null, queryDocs, self.idProperty );
            }

          })
        })
      })
    });
  },


  _makeGet: function( body, params, options, next ){

    var self = this;
    var errors = [];

    // Check that the method is implemented
    if( ! self.handleGet ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( params, errors );
 
    // There was a problem: return the errors
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors } ) );
      return;
    }

    // Fetch the doc.
    self.driverAllDbFetch( body, params, options, function( err, fullDoc ){
      self._sendErrorOnErr( err, next, function(){

        if( ! fullDoc ){
          self._sendError( next, new self.NotFoundError());
        } else {

          self.extrapolateDoc( body, params, options, fullDoc, function( err, doc ){
            self._sendErrorOnErr( err, next, function(){

              // Check the permissions 
              self.checkPermissionsGet( body, params, options, doc, fullDoc, function( err, granted ){
                self._sendErrorOnErr( err, next, function(){

                  if( ! granted ){
                    self._sendError( next, new self.ForbiddenError() ); 
                  } else {
                
                    self.afterGet( body, params, options,  doc, fullDoc, function( err ) {
                      self._sendErrorOnErr( err, next, function(){

                        // "preparing" the doc. The same function is used by GET for collections 
                        self.prepareBeforeSend( doc, function( err, doc ){
                          self._sendErrorOnErr( err, next, function(){
            
                            // Remote request: set headers, and send the doc back (if echo is on)
                            if( self.remote ){

                              // Send "prepared" doc
                              self._res.json( 200, doc );

                            // Local request: simply return the doc to the asking function
                             } else {
                               next( null, doc, self.idProperty );
                             }


                          }) // err
                        }) // self.prepareBeforeSend


                      }) // err
                    }) // self.afterGet

                  } // granted

                }) // err
              }) // self.checkPermissionsGet


            }) // err
          }) // self.extrapolateDoc

        } // if self.fetchedDoc

      }) // err
    }) // self.driverAllDbFetchDoc
  },


  _makeDelete: function( body, params, options, next ){

    var self = this;
    var errors = [];

    // Check that the method is implemented
    if( ! self.handleDelete ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( params, errors );
 
    // There was a problem: return the errors
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors } ) );
      return;
    }

    // Fetch the doc.
    self.driverAllDbFetch( body, params, options, function( err, fullDoc ){
      self._sendErrorOnErr( err, next, function(){

        if( ! fullDoc ){
          self._sendError( next, new self.NotFoundError());
        } else {

          self.extrapolateDoc( body, params, options, fullDoc, function( err, doc ){
            self._sendErrorOnErr( err, next, function(){


              // Check the permissions 
              self.checkPermissionsDelete( body, params, options, doc, fullDoc, function( err, granted ){
                self._sendErrorOnErr( err, next, function(){

                  if( ! granted ){
                    self._sendError( next, new self.ForbiddenError() );
                  } else {
              
                    self.afterDelete( body, params, options, doc, fullDoc, function( err ) {
                      self._sendErrorOnErr( err, next, function(){

                        // Actually delete the document
                        self.driverDeleteDbDo( body, params, options, function( err ){
                          self._sendErrorOnErr( err, next, function(){

                            // Remote request: set headers, and send the doc back (if echo is on)
                            if( self.remote ){
                              // Return 204 and empty contents as requested by RFC
                              res.send( 204, '' );

                            // Local request: simply return the doc to the asking function
                            } else {
                              next( null, doc, self.idProperty );
                            }

                          })  // err
                        })

                      }) // err
                    }) // self.afterDelete

                  } // granted


                }) // err
              }) // self.checkPermissionsGet

            }) // err
          }) // self.extrapolateDoc

        } // if self.fetchedDoc

      }) // err
    }) // self.driverAllDbFetchDoc

  },

  // Permission stock functions
  checkPermissionsPost: function( body, params, options, cb ){
    cb( null, true );
  },
  checkPermissionsPostAppend: function( body, params, options, doc, fullDoc, cb ){
    cb( null, true );
  },
  checkPermissionsPutNew: function( body, params, options, cb ){
    cb( null, true );
  },
  checkPermissionsPutExisting: function( body, params, options, doc, fullDoc, cb ){
    cb( null, true );
  },
  checkPermissionsGet: function( body, params, options, doc, fullDoc, cb ){
    cb( null, true );
  },
  checkPermissionsDelete: function( body, params, options, doc, fullDoc, cb ){
    cb( null, true );
  },



  initOptionsFromReq: function( req, mn ){

    var options = {};
  

    // Set the 'overwrite' option if the right header
    // is there
    if( mn == 'Put' ){
      if( req.headers[ 'if-match' ] === '*' )
        options.overwrite = true;
      if( req.headers[ 'if-none-match' ] === '*' )
        options.overwrite = false;
    }


    // Set the 'SortBy', 'ranges' and 'filters' in
    // the options, based on the passed headers

    if( mn == 'GetQuery' ){
      options.sortBy = parseSortBy( req );
      options.ranges = parseRangeHeaders( req );
      options.filters = parseFilters( req );
    }

    return options;


    function parseSortBy( req ){

      var url_parts = url.parse( req.url, false );
      var q = url_parts.query || '';
      var sortBy;
      var tokens, subTokens, subToken, subTokenClean, i;
      var sortObject = {};

      tokens = q.split( '&' ).forEach( function( item ) {

        var tokens = item.split('=');
        var tokenLeft = tokens[0];
        var tokenRight = tokens[1];

        if(tokenLeft === 'sortBy'){
          subTokens = tokenRight.split(',');
          for( i = 0; i < subTokens.length; i++ ){

            subToken = subTokens[ i ];
            subTokenClean = subToken.replace( '+', '' ).replace( '-', '' );

            if( self.schema.structure[ subTokenClean ] && self.schema.structure[ subTokenClean ].sortable ){
              var sortDirection = subTokens[i][0] == '+' ? 1 : -1;
              sortBy = subTokens[ i ].replace( '+', '' ).replace( '-', '' );
              sortObject[ sortBy ] = sortDirection;
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
      if( (hr = req.headers['range']) && ( tokens = hr.match(/items=([0-9]+)\-([0-9]+)$/))  ){
        rangeFrom = tokens[1] - 0;
        rangeTo = tokens[2] - 0;
        limit =  rangeTo - rangeFrom + 1;

        return( {
          rangeFrom: rangeFrom,
          rangeTo: rangeTo,
          limit:  limit,
        });
      } 

      // Range headers not found or not valid, return null 
      return null;
    }


    function parseFilters( req ){

      var url_parts = url.parse( req.url, false );
      var q = url_parts.query || '';
      var tokens, tokenLeft, tokenRight;
      var result = {};
      var failedCasts;

      options = typeof( options) === 'object' ? options : {};
      options.partial = typeof(options.partial) === 'object' ? options.partial : {};

      q.split( '&' ).forEach( function( item ) {

        tokens = item.split('=');
        tokenLeft  = tokens[0];
        tokenRight = tokens[1];

        // Only add it to the filter if it's in the schema AND if it's searchable
        if( tokenLeft != 'sortBy' && self.schema.structure[ tokenLeft ] && self.schema.structure[ tokenLeft ].searchable ) {
          result[ tokenLeft ] = tokenRight;
        }
      })

      // Cast result values according to schema
      failedCasts = self.schema._castObjectValues( result );

      // Failed casts are taken out of the result
      for( var k in failedCasts ) delete result[ k ];

      return result;
    }

  },


});


// Make up the class method "online.XXX"
Store.online = {};

// Make Store.makeGet, Store.makeGetQuery, etc.
[ 'Get', 'GetQuery', 'Put', 'Post', 'PostAppend', 'Delete' ].forEach( function(mn){
  Store.online[mn] = function( Class ){
    return function( req, res, next ){
      var request = new Class();
      request.remote = true;

      request._req = req;
      request._res = res;

      // Set the params and body options, copying them from `req`
      var params = {}; for( var k in req.params) params[ k ] = req.params[ k ];
      var body = {}; for( var k in req.body) body[ k ] = req.body[ k ];

      // Since it's an online request, options are set by "req"
      var options = request.initOptionsFromReq( mn, req );

      // Actually run the request
      request['_make' + mn ]( body, params, options, next );

      //request['_make' + mn ]( req, res, next );
      
    }
  }
});


// Store.api = {};
// Make Store.makeGet, Store.makeGetQuery, etc.
[ 'Get', 'GetQuery', 'Put', 'Post', 'PostAppend', 'Delete' ].forEach( function(mn){
  Store[mn] = function( body, params, options, Class, next ){

    // Make arguments optional
    var len =  arguments.length;
    if( len == 1 ){
      next = params; body = {}; options = {}; Class = this;
    } else if( len == 2 ){
      next = body; body = {}; options = {}; Class = this;
    } else if( len == 3 ) {
      next = options; options = {}; Class = this;
    } else if( len == 4 ){
      next = Class;
      Class = this;
    } 

    var request = new Class();
    request.remote = false;
    request['_make' + mn ]( body, params, options, next );
  }
})




// var get = Store.Get( Users, { ... params ...}, { doc } );
// ..OR...
// var get = Users.Get( { ... params ...}, { doc }, { options } );

Store.onlineAll = function( app, url, idName, Class ){

  // If the last parameter wasn't passed, it will default
  // to `this` (which will be the constructor itself)
  if( typeof( Class ) === 'undefined' ) var Class = this;

  // Make entries in "app", so that the application
  // will give the right responses
  app.get(      url + idName, Store.online.Get( Class ) );
  app.get(      url,          Store.online.GetQuery( Class ) );
  app.put(      url + idName, Store.online.Put( Class ) );
  app.post(     url,          Store.online.Post( Class ) );
  app.post(     url + idName, Store.online.PostAppend( Class ) );
  app.delete(   url + idName, Store.online.Delete( Class ) );
}

exports = module.exports = Store;


