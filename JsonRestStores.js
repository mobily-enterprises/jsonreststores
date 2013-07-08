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

  schema: null,
  searchSchema: null,

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

  constructor: function(){

    var self = this;

    // Sets proto.paramId, which (as for the principle of 
    // least surprise) must be the last paramId passed to
    // the store.
    this.idProperty = self._lastParamId();

    // The schema must be defined
    if( typeof( this.schema ) === 'undefined' || this.schema == null ){
      throw( new Error("You must define a schema") );
    }

    // the store name must be defined
    if( this.storeName === null  ){
      throw( new Error("You must define a store name for a store") );
    }


    // Sets SearchSchema
    if( this.searchSchema == null ){
      this.searchSchema = this.schema;
    }

  },


  // *********************************************************************
  // *** DRIVER FUNCTIONS THAT MUST BE OVERRIDDEN BY DB-SPECIFIC DRIVERS
  // *** (Only sample data here)
  // *********************************************************************
  

  driverAllDbFetch: function( params, body, options, cb ){
    var doc = { id: 'id', dummyData: 'value'};
    cb( null, doc );
  }, 

  driverGetDbQuery: function( params, body, options, cb ){
    cb( null, [{ id: 'id1', dummyData: 'value1'}, { id: 'id2', dummyData: 'value2'} ] );
  },

  driverPutDbInsert: function( params, body, options, cb ){
    cb( null, body );
  },

  driverPutDbUpdate: function( params, body, options, doc, fullDoc, cb ){
    cb( null, doc );
  },

  driverPostDbInsertNoId: function( params, body, options, generatedId, cb ){
    cb( null, body );
  },

  driverPostDbAppend: function( params, body, options, doc, fullDoc, cb ){
    cb( null, doc );
  },

  driverDeleteDbDo: function( params, body, options, id, cb ){
    cb( null );
  },


  // ****************************************************
  // *** FUNCTIONS THAT CAN BE OVERRIDDEN BY DEVELOPERS
  // ****************************************************

  // DB manupulation functions (to be overridden by inheriting classes) ***

  extrapolateDoc: function( params, body, options, fullDoc, cb ){
    cb( null, fullDoc );
  },

  prepareBeforeSend: function( doc, cb ){
    cb( null, doc );
  },

  // Error management/logging functions

  formatErrorResponse: function( error ){

    if( error.errors ){
      return { message: error.message, errors: error.errors }
    } else {
      return { message: error.message }
    }
  },

  logError: function( error ){
  },


  // "after" calls

  afterPutNew: function( params, body, options, doc, fullDoc, overwrite, cb ){
    cb( null )
  },
  afterPutExisting: function( params, body, options, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){
    cb( null )
  },

  afterPost: function( params, body, options, doc, fullDoc, cb){
    cb( null );
  },

  afterPostAppend: function( params, body, options, doc, fullDoc, docAfter, fullDocAfter, cb ){
    cb( null );
  },

  afterDelete: function( params, body, options, doc, fullDoc, cb ){
    cb( null );
  },

  afterGet: function( params, body, options, doc, fullDoc, cb ) {
    cb( null );
  },

  // Permission stock functions

  checkPermissionsPost: function( params, body, options, cb ){
    cb( null, true );
  },
  checkPermissionsPostAppend: function( params, body, options, doc, fullDoc, cb ){
    cb( null, true );
  },
  checkPermissionsPutNew: function( params, body, options, cb ){
    cb( null, true );
  },
  checkPermissionsPutExisting: function( params, body, options, doc, fullDoc, cb ){
    cb( null, true );
  },
  checkPermissionsGet: function( params, body, options, doc, fullDoc, cb ){
    cb( null, true );
  },
  checkPermissionsDelete: function( params, body, options, doc, fullDoc, cb ){
    cb( null, true );
  },



  // ****************************************************
  // *** INTERNAL FUNCTIONS, DO NOT TOUCH
  // ****************************************************


  _clone: function( obj ){
    return  JSON.parse( JSON.stringify( obj ) );
  },


  _extrapolateAndPrepareAll: function( params, body, options, docs, cb ){

    var self = this;


    var changeFunctions = [];
    docs.forEach( function( fullDoc, index ){

      changeFunctions.push( function( callback ){

        self.extrapolateDoc(  params, body, options, fullDoc, function( err, extrapolatedDoc ){
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
  _checkParamIds: function( params, body, errors, skipIdProperty ){

    var self = this;
    var fakeRecord = {}, fakeSchema = {}, fakeSchemaDef = {}, castOptions = {};

    // This shouldn't happen
    if( self.paramIds.length === 0 ) return;

    // This is to optimise a little: if there is only
    // one self.paramIds and skipIdProperty is on,
    // the resulting fakeRecord would be empty and
    // this would be a big waste of time
    if( self.paramIds.length === 1 && skipIdProperty ) return;

    // Make up the fake schema definition, based on the paramIds of the "real" schema
    self.paramIds.forEach( function(k ) {
      if( typeof( self.schema.structure[ k ] ) === 'undefined' ){
        throw new Error( 'This paramId must be in schema: ' + k);

      } else {

        if( !( skipIdProperty && k == self.idProperty ) ){
          fakeSchemaDef[ k ] = self.schema.structure[ k ];
          fakeSchemaDef[ k ].required = true;
          if( typeof( params[ k ]) !== 'undefined' ){  fakeRecord[ k ] = params[ k ]; }
        }
      }
    });

    // Make up the fake schema
    fakeSchema = new self.schema.constructor( fakeSchemaDef );

    // Apply the fake schema (just paramIds) to the fake record (just the paramIds values)
    fakeSchema.castAndParams( fakeRecord, errors );

    // Copy those cast values back onto the params and body, so that
    // other store calls will have ready-to-use cast
    // elements in `params` and `body`
    self.paramIds.forEach( function( k ) {
      if( typeof( fakeRecord[ k ] ) !== 'undefined' ){
        params[ k ] = fakeRecord[ k ];
        body[ k ] = fakeRecord[ k ];
      }
    });

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

            if( self.searchSchema.structure[ subTokenClean ] && self.searchSchema.structure[ subTokenClean ].sortable ){
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
        if( tokenLeft != 'sortBy' && self.searchSchema.structure[ tokenLeft ] && self.searchSchema.structure[ tokenLeft ].searchable ) {
        // if( tokenLeft != 'sortBy' && self.searchSchema.structure[ tokenLeft ] ) {
          result[ tokenLeft ] = tokenRight;
        }
      })

      // Cast result values according to schema
      //failedCasts = self.schema._castObjectValues( result );

      // Failed casts are taken out of the result
      //for( var k in failedCasts ) delete result[ k ];

      return result;
    }

  },



  // ****************************************************
  // *** INTERNAL FUNCTIONS - THE REAL DANCE
  // ****************************************************


  _makePost: function( params, body, options, next ){

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
    self._checkParamIds( params, body, errors, true );
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors }  ) );
      return;
    }
  
    //body = self._clone( body );
 
    // Do schema cast and check
    //if( self.schema !== null ){
    self.schema.castAndParams(  body, errors, { notRequired: [ self.idProperty ], skipCast: [ self.idProperty ]  } );
    //}

    //var validateFunction = function( body, errors, cb ) { cb( null ) }
    //if( typeof( self.schema ) !== 'undefined' ){ validateFunction = self.schema.validate; }


    //validateFunction.call( self.schema, body,  errors, function( err ){
    self.schema.validate( body,  errors, function( err ){
    
      self._sendErrorOnErr( err, next, function(){

        if( errors.length ){
          self._sendError( next, new self.UnprocessableEntityError( { errors: errors } ) );
        } else {

          // Actually check permissions
          self.checkPermissionsPost( params, body, options, function( err, granted ){
            self._sendErrorOnErr( err, next, function(){

              if( ! granted ){
                self._sendError( next, new self.ForbiddenError() );
              } else {

                // Clean up body from things that are not to be submitted
                //if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                self.schema.cleanup( body, 'doNotSave' );

                self.schema.makeId( body, function( err, generatedId){
                  self._sendErrorOnErr( err, next, function(){


                    self.driverPostDbInsertNoId( params, body, options, generatedId, function( err, fullDoc ){
                      self._sendErrorOnErr( err, next, function(){

                        self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                          self._sendErrorOnErr( err, next, function(){


                            self.afterPost( params, body, options, doc, fullDoc, function( err ){
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

  _makePostAppend: function( params, body, options, next ){

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
    self._checkParamIds( params, body, errors );
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors } ) );
      return;
    }
   
    //body = self._clone( req.body );

    //// Do schema cast and check
    //if( self.schema !== null ){
    self.schema.castAndParams(  body, errors );
    //}
 
    //var validateFunction = function( body, errors, cb ) { cb( null ) }
    //if( typeof( self.schema ) !== 'undefined' ){ validateFunction = self.schema.validate; }

    //validateFunction.call( self.schema, body,  errors, function( err ){
    self.schema.validate( body,  errors, function( err ){
      self._sendErrorOnErr( err, next, function(){

        if( errors.length ){
          self._sendError( next, new self.UnprocessableEntityError( { errors: errors } ) );
        } else {
          // Fetch the doc
          self.driverAllDbFetch( params, body, options, function( err, fullDoc ){
            self._sendErrorOnErr( err, next, function(){

              // Get the extrapolated doc
              self.extrapolateDoc( params, body, options, fullDoc, function( err, doc ){
                self._sendErrorOnErr( err, next, function(){

                  // Actually check permissions
                  self.checkPermissionsPostAppend( params, body, options, doc, fullDoc, function( err, granted ){
                    self._sendErrorOnErr( err, next, function(){

                      if( ! granted ){
                        self._sendError( next, new self.ForbiddenError() );
                      } else {

                        // Clean up body from things that are not to be submitted
                        //if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                        self.schema.cleanup( body, 'doNotSave' );

                        // Paranoid check
                        // Make sure that the id property in the body does match
                        // the one passed as last parameter in the list of IDs
                        body[ self.idProperty ] = params[ self.idProperty ];

                        self.driverPostDbAppend( params, body, options, doc, fullDoc, function( err, fullDocAfter ){
                          self._sendErrorOnErr( err, next, function(){
  
                            self.extrapolateDoc( params, body, options, fullDoc, function( err, docAfter ){
                              self._sendErrorOnErr( err, next, function(){

                                self.afterPostAppend( params, body, options, doc, fullDoc, docAfter, fullDocAfter, function( err ){
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


  _makePut: function( params, body, options, next ){

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
    self._checkParamIds( params, body, errors );
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors }  ) );
      return;
    }
    
    // body = self._clone( req.body );

    // Do schema cast and check
    //if( self.schema !== null ){
    self.schema.castAndParams(  body, errors );
    //}

    //var validateFunction = function( body, errors, cb ) { cb( null ) }
    //if( typeof( self.schema ) !== 'undefined' ){ validateFunction = self.schema.validate; }

    //validateFunction.call( self.schema, body,  errors, function( err ){
    self.schema.validate( body,  errors, function( err ){
      self._sendErrorOnErr( err, next, function(){

        if( errors.length ){
          self._sendError( next, new self.UnprocessableEntityError( { errors: errors } ) );
        } else {

          // Fetch the doc
          self.driverAllDbFetch( params, body, options, function( err, fullDoc ){
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
                  self.checkPermissionsPutNew( params, body, options, function( err, granted ){
                    self._sendErrorOnErr( err, next, function(){


                      if( ! granted ){
                        self._sendError( next, new self.ForbiddenError() );
                      } else {

                        // Clean up body from things that are not to be submitted
                        // if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                        self.schema.cleanup( body, 'doNotSave' );

                        // Paranoid check
                        // Make sure that the id property in the body does match
                        // the one passed as last parameter in the list of IDs
                        body[ self.idProperty ] = params[ self.idProperty ];

                        self.driverPutDbInsert( params, body, options, function( err, fullDoc ){
                          self._sendErrorOnErr( err, next, function(){

                            // Update "doc" to be the complete version of the doc from the DB
                            self.extrapolateDoc( params, body, options, fullDoc, function( err, doc ){
                              self._sendErrorOnErr( err, next, function(){

                                self.afterPutNew( params, body, options, doc, fullDoc, options.overwrite, function( err ){
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

                  self.extrapolateDoc( params, body, options, fullDoc, function( err, doc ){
                    self._sendErrorOnErr( err, next, function(){

                      // Actually check permissions
                      self.checkPermissionsPutExisting( params, body, options, doc, fullDoc, function( err, granted ){
                        self._sendErrorOnErr( err, next, function(){

                          if( ! granted ){
                            self._sendError( next, new self.ForbiddenError() );
                          } else {

                            // Clean up body from things that are not to be submitted
                            // if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                            self.schema.cleanup( body, 'doNotSave' );

                            self.driverPutDbUpdate( params, body, options, doc, fullDoc, function( err, fullDocAfter ){
                              self._sendErrorOnErr( err, next, function(){

                                // Update "doc" to be the complete version of the doc from the DB
                                self.extrapolateDoc( params, body, options, fullDocAfter, function( err, docAfter ){
                                  self._sendErrorOnErr( err, next, function(){

                                    // Remote request: set headers, and send the doc back (if echo is on)
                                    if( self.remote ){

                                      // Set the Location header if it was a remote request
                                      self._res.setHeader( 'Location', self._req.originalUrl + doc[ self.idProperty ] );
                                      self.afterPutExisting( params, body, options, doc, docAfter, fullDoc, fullDocAfter, options.overwrite, function( err ) {
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

  _makeGetQuery: function( params, body, options, next ){

    var self = this;
    var errors = [];
    var sortBy, range, filters;

    // Check that the method is implemented
    if( ! self.handleGetQuery ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }
  
    // The schema must be defined for queries. It's too important, as it defines
    // what's searchable and what's sortable
    if( self.searchSchema == null ){
      self._sendError( next, new Error('Query attempted on schema-less store' ) );
      return;
    }

    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( params, body, errors, true );
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors } ) );
      return;
    }
 
    // Set reasonable (good) defaults
    sortBy = options.sortBy;
    ranges = options.ranges;
    filters = options.filters;
    if( typeof( ranges ) === 'undefined' || ! ranges ) ranges = {};
    if( typeof( ranges.rangeFrom ) === 'undefined' ) ranges.rangeFrom = 0;
    if( typeof( ranges.rangeTo )   === 'undefined' ) ranges.rangeTo   = 0;
    if( typeof( filters) === 'undefined' ) filters = {};

    // If filters were passed locally, cast them
    //if( ! self.remote ){
    var fc = self.searchSchema._cast( filters, { onlyObjectValues: true } );

    // This replicates what schema.castAndParams() would do, but deleting
    // non-castable search fields rather than giving out errors
    var originalFilters = self._clone( filters );
    var failedCasts = self.searchSchema._cast( filters, { onlyObjectValues: true }  );
    Object.keys( failedCasts ).forEach( function( fieldName ){
      delete( filters[ fieldName ] ); 
    });
    self.searchSchema._params( filters, originalFilters, errors, { onlyObjectValues: true }, failedCasts );

    // Errors in casting: give up, run away
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors } ) );
      return;
    }

    self.driverGetDbQuery( params, body, options, function( err, queryDocs ){
      self._sendErrorOnErr( err, next, function(){

        self._extrapolateAndPrepareAll( params, body, options, queryDocs, function( err ){
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


  _makeGet: function( params, body, options, next ){

    var self = this;
    var errors = [];

    // Check that the method is implemented
    if( ! self.handleGet ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( params, body, errors );
 
    // There was a problem: return the errors
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors } ) );
      return;
    }
 
    // Fetch the doc.
    self.driverAllDbFetch( params, body, options, function( err, fullDoc ){
      self._sendErrorOnErr( err, next, function(){

        if( ! fullDoc ){
          self._sendError( next, new self.NotFoundError());
        } else {

          self.extrapolateDoc( params, body, options, fullDoc, function( err, doc ){
            self._sendErrorOnErr( err, next, function(){

              // Check the permissions 
              self.checkPermissionsGet( params, body, options, doc, fullDoc, function( err, granted ){
                self._sendErrorOnErr( err, next, function(){

                  if( ! granted ){
                    self._sendError( next, new self.ForbiddenError() ); 
                  } else {
                
                    self.afterGet( params, body, options,  doc, fullDoc, function( err ) {
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


  _makeDelete: function( params, body, options, next ){

    var self = this;
    var errors = [];

    // Check that the method is implemented
    if( ! self.handleDelete ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( params, body, errors );
 
    // There was a problem: return the errors
    if( errors.length ){
      self._sendError( next, new self.BadRequestError( { errors: errors } ) );
      return;
    }

    // Fetch the doc.
    self.driverAllDbFetch( params, body, options, function( err, fullDoc ){
      self._sendErrorOnErr( err, next, function(){

        if( ! fullDoc ){
          self._sendError( next, new self.NotFoundError());
        } else {

          self.extrapolateDoc( params, body, options, fullDoc, function( err, doc ){
            self._sendErrorOnErr( err, next, function(){


              // Check the permissions 
              self.checkPermissionsDelete( params, body, options, doc, fullDoc, function( err, granted ){
                self._sendErrorOnErr( err, next, function(){

                  if( ! granted ){
                    self._sendError( next, new self.ForbiddenError() );
                  } else {
              
                    self.afterDelete( params, body, options, doc, fullDoc, function( err ) {
                      self._sendErrorOnErr( err, next, function(){

                        // Actually delete the document
                        self.driverDeleteDbDo( params, body, options, function( err ){
                          self._sendErrorOnErr( err, next, function(){

                            // Remote request: set headers, and send the doc back (if echo is on)
                            if( self.remote ){
                              // Return 204 and empty contents as requested by RFC
                              self._res.send( 204, '' );

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

});


// ****************************************************
// *** ONLINE USE OF FUNCTIONS
// ****************************************************


// Make up the class method "online.XXX"
Store.online = {};

// Make Store.makeGet(Class), Store.makeGetQuery(Class), etc.
[ 'Get', 'GetQuery', 'Put', 'Post', 'PostAppend', 'Delete' ].forEach( function(mn){
  Store.online[mn] = function( Class ){
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
      request['_make' + mn ]( params, body, options, next );

      //request['_make' + mn ]( req, res, next );
      
    }
  }
});


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



// ****************************************************
// *** API FUNCTIONS AS CLASS METHODS
// ****************************************************


Store.Get = function( id, options, next ){

  var Class = this;

  // Make `options` argument optional
  var len =  arguments.length;
  if( len == 2 ) { next = options; options = {}; };

  // Make up the request
  var request = new Class();

  // Fix it for the API
  fixRequestForApi( request );

  // Make up "params" to be passed to the _makeGet function
  var params = {};
  params[ request._lastParamId() ] = id;

  // Actually run the request
  request._makeGet( params, {}, options, next );
}


Store.GetQuery = function( options, next ){

  var Class = this;

  // Make up the request
  var request = new Class();

  // Fix it for the API
  fixRequestForApi( request );

  // Actually run the request
  request._makeGetQuery( {}, {}, options, next );
}

Store.Put = function( id, body, options, next ){

  var Class = this;

  // Make `options` argument optional
  var len =  arguments.length;
  if( len == 3 ) { next = options; options = {}; };

  // Make up the request
  var request = new Class();

  // Fix it for the API
  fixRequestForApi( request );

  // Make up "params" to be passed to the _makeGet function
  var params = {};
  params[ request._lastParamId() ] = id;

  // Actually run the request
  request._makePut( params, body, options, next );
}

Store.Post = function( body, options, next ){

  var Class = this;

  // Make `options` argument optional
  var len =  arguments.length;
  if( len == 2 ) { next = options; options = {}; };

  // Make up the request
  var request = new Class();

  // Fix it for the API
  fixRequestForApi( request );

  // Actually run the request
  request._makePost( {}, body, options, next );
}

Store.PostAppend = function( id, body, options, next ){

  var Class = this;

  // Make `options` argument optional
  var len =  arguments.length;
  if( len == 3 ) { next = options; options = {}; };

  // Make up the request
  var request = new Class();

  // Fix it for the API
  fixRequestForApi( request );

  // Make up "params" to be passed to the _makeGet function
  var params = {};
  params[ request._lastParamId() ] = id;

  // Actually run the request
  request._makePostAppend( params, body, options, next );
}

Store.Delete = function( id, options, next ){

  var Class = this;

  // Make `options` argument optional
  var len =  arguments.length;
  if( len == 2 ) { next = options; options = {}; };

  // Make up the request
  var request = new Class();

  // Fix it for the API
  fixRequestForApi( request );

  // Make up "params" to be passed to the _makeGet function
  var params = {};
  params[ request._lastParamId() ] = id;

  // Actually run the request
  request._makeDelete( params, {}, options, next );
}

function fixRequestForApi( request ){

    // Strip all of the paramIds dictated by the original
    // definition, just leaves the last one
    request.paramIds = Array( request._lastParamId() );

    // Makes sure it handles all types of requests
    request.handlePut = true;
    request.handlePost = true;
    request.handlePostAppend = true;
    request.handleGet = true;
    request.handleGetQuery = true;
    request.handleDelete = true;

    // It's not a remote request
    request.remote = false;   
}



exports = module.exports = Store;


