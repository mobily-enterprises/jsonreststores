/*
Copyright (C) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

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

  DbDriver: null,

  idProperty: null,

  storeName: null,
  collectionName: null,

  queryFilterType: 'and',
 
  handlePut: false,
  handlePost: false,
  handlePostAppend: false,
  handleGet: false,
  handleGetQuery: false,
  handleDelete: false,

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

  hardLimitOnQueries: 50,

  constructor: function( DbDriver ){

    var self = this;

    // Accept the DB driver from the constructor. If it's not passed through the
    // constructor, then it must be already in the prototype (inherited or set)
    if( typeof( DbDriver ) !== 'undefined' ){
      self.DbDriver = DbDriver;
    }
    
    // The db driver must be defined
    if( typeof( self.dbDriver ) === 'undefined' || self.dbDriver == null ){
      throw( new Error("You must define a db driver, via constructor or via prototype") );
    }


    this.collectionName = this.collectionName ? this.collectionName : this.storeName;

    // Sets proto.paramId, which (as for the principle of 
    // least surprise) must be the last paramId passed to
    // the store.
    this.idProperty = self._lastParamId();

    // The schema must be defined
    if( typeof( self.schema ) === 'undefined' || self.schema == null ){
      throw( new Error("You must define a schema") );
    }

    // the store name must be defined
    if( self.storeName === null  ){
      throw( new Error("You must define a store name for a store") );
    }

    // Sets SearchSchema
    if( self.searchSchema == null ){
      self.searchSchema = self.schema;
    }

    // Create the dbDriver object, ready to accept queries
    self.dbDriver = new DbDriver( self.collectionName, self.schema );
  },



  enrichSelectorWithParams: function( params ){

    var selector = {};
    
    selector.conditions = {};
    selector.conditions.and = {};

    var self = this;

    /*
    // filter.conditions.and needs to exist and be an object
    if( typeof( filter.conditions ) === 'undefined' || filter.conditions === null ){
      filter.conditions = {};
    } 
    if( typeof( filter.conditions.and ) === 'undefined' || filter.conditions.and === null ){
      filter.conditions.and = {};
    } 
    */

    // Add param IDs as "AND" conditions to the query
    self.paramIds.forEach( function( paramId ){
      if( typeof( params[ paramId ]) !== 'undefined' ){
        selector.conditions.and[ paramId ] = { type: 'eq', value: params[ paramId ] };
      }
    });

    return selector;

  },


  // *********************************************************************
  // *** FUNCTIONS THAT ACTUALLY ACCESS DATA THROUGH THE DB DRIVER
  // *********************************************************************
 

  execAllDbFetch: function( params, body, options, cb ){

    var self = this;

    // Make up the filter, based on the store's IDs (used as filters).
    var selector = {};

    self.enrichSelectorWithParams( selector, params );

    // Make the database call 
    self.dbDriver.select( selector, cb );

  }, 

  execPostDbInsertNoId: function( params, body, options, generatedId, cb ){
   
    var self = this;

    var record = {};

    // Make up the `record` variable, based on the passed `body`
    for( var k in body ) record[ k ] = body[ k ];

    // Add param IDs to the record that is being written
    self.paramIds.forEach( function( paramId ){
      if( typeof( params[ paramId ] ) !== 'undefined' ){
        record[ paramId ] = params[ paramId ];
      }
    });

    // The last parameter is missing since it
    // wasn't passed: assign an ObjectId to it
    record[ self.idProperty ] = generatedId;

    self.dbDriver.insert( record, { returnRecord: true }, cb );

  },

  execPutDbUpdate: function( params, body, options, doc, fullDoc, cb ){

    var self = this;
    var updateObject = {}, unsetObject = {};

    // Make up the filter, based on the store's IDs (used as filters).
    var selector = {};

    self.enrichSelectorWithParams( selector, params );

    // Simply copy values over except self.idProperty (which mustn't be
    // overwritten)
    for( var i in body ){
      if( i != self.idProperty ) updateObject[ i ] = body[ i ];
    }

    self.dbDriver.update( selector, { deleteUnsetFields: true, multi: false }, function( err, howMany ){
      if( err ){
        cb( err );
      } else {

        filter.ranges.limit = 1;
        self.dbDriver.select( filter, cb );

      }

    });
  },


  execPutDbInsert: function( params, body, options, cb ){
  
    var self = this;

    var record = {};

    // Make up the `record` variable, based on the passed `body`
    for( var k in body ) record[ k ] = body[ k ];

    // Add param IDs to the record that is being written
    self.paramIds.forEach( function( paramId ){
      if( typeof( params[ paramId ] ) !== 'undefined' ){
        record[ paramId ] = params[ paramId ];
      }
    });

    self.dbDriver.insert( record, { returnRecord: true }, cb );

  },

  execPostDbAppend: function( params, body, options, doc, fullDoc, cb ){

    // Is this _ever_ implemented, really? Seriously?
    cb( null, doc );
  },


  execDeleteDbDelete: function( params, body, options, cb ){

    var self = this;
    var selector = {};

    self.enrichSelectorWithParams( selector, params );
    self.dbDriver.delete( selector, { multi: false }, cb );
  },


  _queryMakeSelector: function( filters, sort, ranges ){

    // Define and set the conditions variable, which will be returned
    var conditions = {};
    conditions.and = {}
    conditions.or = {}

    // Add filters to the selector
    for( var filterField in filters ){

      var filterValue = filters[ filterField ];

      if( self.searchSchema.structure[ filterField ].filterType ){
        var filterType= self.searchSchema.structure[ filterfield ].filterType;

        // Double check that the referenced field exists
        if( filterType.field && typeof( self.searchSchema.structure[ filterType.field ] ) === 'undefined' ){
          throw( new Error('"field" option in filter type is undefined: ' + filterType.field  ) );
        }
        var dbField = filterType.field || filterField;
        var condition = filterType.condition || 'or';

        conditions[ condition ] [ dbField ] = { type: filterType.type, value: filters[ filterField ] };
      }
    }

    return {
      conditions: conditions,
      ranges: ranges,
      sort: sort,
    };
  },


  /*
      * REMOTE: options.filters, options.sortBy, options.ranges are created by _initOptionsFromReq
      * LOCAL: user sets options.filters, options.sortBy and options.ranges

      * AND THEN
      * self._queryMakeSelector( options ) returns the full db selector for those options
      * self._queryMakeSelector( options ) is called

    Local:
      * user sets options.filters, options.sortBy and options.ranges
      *
  */

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

            if( ! self.remote || ( self.searchSchema.structure[ subTokenClean ] && self.searchSchema.structure[ subTokenClean ].sortable ) ){
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
          from: rangeFrom,
          to: rangeTo,
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

      q.split( '&' ).forEach( function( item ) {

        tokens = item.split('=');
        tokenLeft  = tokens[0];
        tokenRight = tokens[1];

        // Only add it to the filter if it's in the schema AND if it's searchable
        //if( tokenLeft != 'sortBy' && ( ! self.remote || ( self.searchSchema.structure[ tokenLeft ] && self.searchSchema.structure[ tokenLeft ].filterType )) ) {
        if( tokenLeft != 'sortBy' && self.searchSchema.structure[ tokenLeft ] && self.searchSchema.structure[ tokenLeft ].filterType  ) {

          result[ tokenLeft ] = tokenRight;

        }
      })


      return result;
    }

  },


  execGetDbQuery: function( params, body, options, next ){

    var self = this;
    var cursor;

    var selector = {};

    // Select according to selector
    var selector = self._queryMakeSelector( options );

    self.enrichSelectorWithParams( selector, params );

    // Run the select based on the passed parameters
    dbLayer.select( selector, next );
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
  checkPermissionsGetQuery: function( params, body, options, cb ){
    cb( null, true );
  },

  checkPermissionsDelete: function( params, body, options, doc, fullDoc, cb ){
    cb( null, true );
  },


  prepareBodyPost: function( body, cb ){
    cb( null, body );
  },

  // ****************************************************
  // *** INTERNAL FUNCTIONS, DO NOT TOUCH
  // ****************************************************


  _extrapolateDocAnd_castDocAndprepareBeforeSendAll: function( params, body, options, docs, cb ){

    var self = this;

    var changeFunctions = [];
    docs.forEach( function( fullDoc, index ){

      changeFunctions.push( function( callback ){

        self.extrapolateDoc(  params, body, options, fullDoc, function( err, doc ){
          if( err ){
            callback( err, null );
          } else {

            self._castDoc( doc, function( err, doc) {
              if( err ){
                callback( err, null );
              } else {

                self.prepareBeforeSend( doc, function( err, doc ){
                  if( err ){
                    callback( err, null );
                  } else {
                    docs[ index ] = doc;
                    callback( null, null );
                  }
                })
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
  _checkParamIds: function( params, body, skipIdProperty, next ){

    var self = this;
    var fakeRecord = {};
    var errors = [];

    // This shouldn't happen
    if( self.paramIds.length === 0 ) return next( null );

    // This is to optimise a little: if there is only
    // one self.paramIds and skipIdProperty is on,
    // the resulting fakeRecord would be empty and
    // this would be a big waste of time
    if( self.paramIds.length === 1 && skipIdProperty ) return next( null );

    // Make up the fake schema definition, based on the paramIds of the "real" schema
    // (In the meantime, also check that ALL paramIds are indeed required)
    self.paramIds.forEach( function(k ) {
      if( typeof( self.schema.structure[ k ] ) === 'undefined' ){
        throw new Error( 'This paramId must be in schema: ' + k);
      } else {
        if( !( skipIdProperty && k == self.idProperty ) ){

          // Copy values over from params to fakeRecord. If undefined,
          // raise an error (unless it's dealing with idProperty and it needs to be skipped)
          if( typeof( params[ k ] ) !== 'undefined' ){
            fakeRecord[ k ] = params[ k ];
          } else {
            if( !( skipIdProperty && k == self.idProperty ) ){
              errors.push( { field: k, message: 'Field required in the URL: ' + k, mustChange: true } ); 
            }
          }
        }
      }
    });

    // If one of the key fields was missing, puke back
    if( errors.length ) return next( new self.BadRequestError( { errors: errors } ) );

    // Apply the schema (just paramIds) to the fake record (`onlyObjectValues` will ensure
    // that only the param IDs will be checked)
    self.schema.validate( fakeRecord, { onlyObjectValues: true }, function( err, fakeRecord, errors ){

      if( err ){
        next( err );
      } else {

        // There was a problem: return the errors
        if( errors.length ){
          next( new self.BadRequestError( { errors: errors } ) );
        } else {

          // Copy those cast values back onto the params and body, so that
          // other store calls will have ready-to-use cast
          // elements in `params` and `body`
          self.paramIds.forEach( function( k ) {
            params[ k ] = fakeRecord[ k ];
            body[ k ] = fakeRecord[ k ];
          });
          next( null );
        }
      }
    });

  },

  _castDoc: function( doc, next ){

    var self = this;

    // Cast the values. This is a relaxed check: if a field is missing, it won't
    // complain. This way, applications won't start failing when adding fields
    self.schema.validate( doc, { onlyObjectValues: true }, function( err, doc, errors ) {
      if( err ){
        next( err );
      } else {
        // There was a problem: return the errors
        if( errors.length ){
          next( new self.BadRequestError( { errors: errors } ) );
        } else {
          next( null, doc );
        }
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




  // ****************************************************
  // *** INTERNAL FUNCTIONS - THE REAL DANCE
  // ****************************************************


  _makePost: function( params, body, options, next ){

    var self = this;
    var body;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePost ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( params, body, true, function( err ){  
      self._sendErrorOnErr( err, next, function(){

        self.prepareBodyPost( body, function( err, body ){
          self._sendErrorOnErr( err, next, function(){
     
            var skipParamsObject = {};
            skipParamsObject[ self.idProperty ] = [ 'required '];

            self.schema.validate( body, { skipParams: skipParamsObject, skipCast: [ self.idProperty ]  }, function( err, body, errors ){
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
        
                            self.execPostDbInsertNoId( params, body, options, generatedId, function( err, fullDoc ){
                              self._sendErrorOnErr( err, next, function(){
        
                                self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                                  self._sendErrorOnErr( err, next, function(){
        
                                    self._castDoc( doc, function( err, doc) {
                                      self._sendErrorOnErr( err, next, function(){
                                    
                                        // Remote request: set headers, and send the doc back (if echo is on)
                                        if( self.remote ){
            
                                          // Set the Location header if it was a remote request
                                          self._res.setHeader( 'Location', self._req.originalUrl + doc[ self.idProperty ] );
                                          if( self.echoAfterPost ){
            
                                            self.prepareBeforeSend( doc, function( err, doc ){
                                              self._sendErrorOnErr( err, next, function(){
            
                                                self.afterPost( params, body, options, doc, fullDoc, function( err ){
                                                  self._sendErrorOnErr( err, next, function(){
            
                                                    self._res.json( 201, doc );
                                                  }) // err
                                                }) // self.afterPost
            
                                               }) // err
                                            }) // self.prepareBeforeSend
            
                                          } else {
            
                                            self.afterPost( params, body, options, doc, fullDoc, function( err ){
                                              self._sendErrorOnErr( err, next, function(){
            
                                                self._res.send( 201, '' );
            
                                              });
                                            });
            
                                          }
            
                                        // Local request: simply return the doc to the asking function
                                        } else {
            
                                          self.prepareBeforeSend( doc, function( err, doc ){
                                            self._sendErrorOnErr( err, next, function(){
            
                                              self.afterPost( params, body, options, doc, fullDoc, function( err ){
                                                self._sendErrorOnErr( err, next, function(){
            
                                                  next( null, doc, self.idProperty );
            
                                                })
                                              })
            
                                            })
                                          })
                                
                                        } 
            
                                   
                                      }) // err
                                    }) // self._castDoc
                                  });
                                }) // self.extrapolateDoc
            
        
                              }) // err
                            }) // execPostDbInsertNoId
        
                          }) // err
                        }) // self.makeId
        
                      } // granted
        
                    }) // err
                  }) // checkPermissionsPost
        
                } // errors.length
        
              }) // err
            }) // validate()
      
          })
        })

      })
    })

  },

  _makePostAppend: function( params, body, options, next ){

    var self = this;
    var body;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePostAppend ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }
  
    // Check the IDs
    self._checkParamIds( params, body, false, function( err ){  
      self._sendErrorOnErr( err, next, function(){
    
        self.schema.validate(  body, function( err, body, errors ) {
          self._sendErrorOnErr( err, next, function(){
    
            if( errors.length ){
              self._sendError( next, new self.UnprocessableEntityError( { errors: errors } ) );
            } else {

              // Fetch the doc
              self.execAllDbFetch( params, body, options, function( err, fullDoc ){
                self._sendErrorOnErr( err, next, function(){
    
    
                  self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                    self._sendErrorOnErr( err, next, function(){
    
                      self._castDoc( doc, function( err, doc) {
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
        
                                self.execPostDbAppend( params, body, options, doc, fullDoc, function( err, fullDocAfter ){
                                  self._sendErrorOnErr( err, next, function(){
         
                                    self.extrapolateDoc( params, body, options, fullDocAfter, function( err, doc) {
                                      self._sendErrorOnErr( err, next, function(){
    
                                        self._castDoc( fullDocAfter, function( err, docAfter) {
                                          self._sendErrorOnErr( err, next, function(){
        
                                            // Remote request: set headers, and send the doc back (if echo is on)
                                            if( self.remote ){
                                              if( self.echoAfterPostAppend ){
            
                                                 self.prepareBeforeSend( docAfter, function( err, docAfter ){
                                                   self._sendErrorOnErr( err, next, function(){
            
                                                      self.afterPostAppend( params, body, options, doc, fullDoc, docAfter, fullDocAfter, function( err ){
                                                        self._sendErrorOnErr( err, next, function(){
            
                                                          self._res.json( 200, docAfter );
            
                                                        });
                                                      });
                                                   })
                                                 })
                                              } else { 
            
                                                self.afterPostAppend( params, body, options, doc, fullDoc, docAfter, fullDocAfter, function( err ){
                                                  self._sendErrorOnErr( err, next, function(){
            
                                                    self._res.send( 204, '' );
            
                                                  });
                                                });
            
                                              }
            
                                            // Local request: simply return the doc to the asking function
                                            } else {
            
                                              self.prepareBeforeSend( docAfter, function( err, docAfter ){
                                                self._sendErrorOnErr( err, next, function(){
            
                                                  self.afterPostAppend( params, body, options, doc, fullDoc, docAfter, fullDocAfter, function( err ){
                                                    self._sendErrorOnErr( err, next, function(){
            
                                                      next( null, docAfter, self.idProperty );
            
                                                    })
                                                  })
            
                                                })
                                              })
                                            }
            
                                          })
                                        });
    
                                      });
                                    })
    
        
                                  }) // err
                                }) // execPostDbAppend
        
                              } // granted
        
        
                            })
                          }) 
        
                        }) 
                      }) 
    
                    })
                  }) 
    
                }) // err
              }) // checkPermissionsPostAppend
       
            } // errors.length
    
          }) // err
        }) // self.validate
    
      }) // err
    }) // self.validate
  },


  _makePut: function( params, body, options, next ){

    var self = this;
    var overwrite;
    var body;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePut ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs.
    self._checkParamIds( params, body, false, function( err ){  
      self._sendErrorOnErr( err, next, function(){

        self.schema.validate(  body, function( err, body, errors ) {
          self._sendErrorOnErr( err, next, function(){
    
            if( errors.length ){
              self._sendError( next, new self.UnprocessableEntityError( { errors: errors } ) );
            } else {
    
              // Fetch the doc
              self.execAllDbFetch( params, body, options, function( err, fullDoc ){
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
    
                            self.execPutDbInsert( params, body, options, function( err, fullDoc ){
                              self._sendErrorOnErr( err, next, function(){
    
                                self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                                  self._sendErrorOnErr( err, next, function(){
    
                                    self._castDoc( doc, function( err, doc) {
                                      self._sendErrorOnErr( err, next, function(){
    
                                        // Remote request: set headers, and send the doc back (if echo is on)
                                        if( self.remote ){
        
                                          // Set the Location header if it was a remote request
                                          self._res.setHeader( 'Location', self._req.originalUrl + doc[ self.idProperty ] );
                                          if( self.echoAfterPutNew ){
        
                                            self.prepareBeforeSend( doc, function( err, doc ){
                                              self._sendErrorOnErr( err, next, function(){
        
                                                self.afterPutNew( params, body, options, doc, fullDoc, options.overwrite, function( err ){
                                                  self._sendErrorOnErr( err, next, function(){
        
                                                    res.json( 201, doc );
                                                  });
                                                });
                                              })
                                            })
                                          } else {
        
                                            self.afterPutNew( params, body, options, doc, fullDoc, options.overwrite, function( err ){
                                              self._sendErrorOnErr( err, next, function(){
        
                                                res.send( 201, '' );
        
                                              });
                                            });
                                          }
        
                                        // Local request: simply return the doc to the asking function
                                        } else {
                                          self.prepareBeforeSend( doc, function( err, doc ){
                                            self._sendErrorOnErr( err, next, function(){
        
                                              self.afterPutNew( params, body, options, doc, fullDoc, options.overwrite, function( err ){
                                                self._sendErrorOnErr( err, next, function(){
        
                                                  next( null, doc, self.idProperty );
        
                                                })
                                              })
        
                                            })
                                          })
                                        }
        
                                      }) // err
                                    }) // self._castDocs
                                  })
                                })
        
                            
                              }) // err
                            }) // self.extrapolateDoc
    
                          } // granted
    
                        }) // err
                      }) // checkPermissionsPutNew
    
    
                    // It's an EXISTING doc: it will need to be an update, _and_ permissions will be
                    // done on inputted data AND existing doc
                    } else {
    
                      self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                        self._sendErrorOnErr( err, next, function(){
    
                          self._castDoc( doc, function( err, doc) {
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
        
                                    self.execPutDbUpdate( params, body, options, doc, fullDoc, function( err, fullDocAfter ){
                                      self._sendErrorOnErr( err, next, function(){
    
                                        self.extrapolateDoc( params, body, options, fullDocAfter, function( err, docAfter ) {
                                          self._sendErrorOnErr( err, next, function(){
    
                                            self._castDoc( docAfter, function( err, docAfter ) {
                                              self._sendErrorOnErr( err, next, function(){
            
                                                // Remote request: set headers, and send the doc back (if echo is on)
                                                if( self.remote ){
            
                                                  // Set the Location header if it was a remote request
                                                  self._res.setHeader( 'Location', self._req.originalUrl + doc[ self.idProperty ] );
            
                                                  if( self.echoAfterPutExisting ){
            
                                                    self.prepareBeforeSend( docAfter, function( err, docAfter ){
                                                      self._sendErrorOnErr( err, next, function(){
            
                                                        self.afterPutExisting( params, body, options, doc, fullDoc, docAfter, fullDocAfter, options.overwrite, function( err ) {
                                                          self._sendErrorOnErr( err, next, function(){
            
                                                            self._res.json( 200, docAfter );
            
                                                          });
                                                        });
            
                                                      })
                                                    })
                                                  } else {
            
                                                    self.afterPutExisting( params, body, options, doc, fullDoc, docAfter, fullDocAfter, options.overwrite, function( err ) {
                                                      self._sendErrorOnErr( err, next, function(){
            
                                                        self._res.send( 200, '' );
                                                        //res.send( 204, 'OK' );
            
                                                      });
                                                    });
                                                  }
            
                                                // Local request: simply return the doc to the asking function
                                                } else {
                                                  self.prepareBeforeSend( docAfter, function( err, docAfter ){
                                                    self._sendErrorOnErr( err, next, function(){
            
                                                      next( null, doc, self.idProperty );
                                                    })
                                                  })
                                                }
            
                                              }) // err
                                            }) 
    
                                          })
                                        })
    
        
                                      }) // err
                                    }) // self.execPutDbUpdate
        
                                  } // granted
        
                                }) // err
                              }) // self.checkPermissionsPutExisting
        
                            }) // err
                          }) 
    
                        })
                      })
    
    
                    }
    
                  } // function continueAfterFetch()
        
                }) // err
              }) // execAllDbFetch
    
            } // if errors.length  
    
          }) // err 
        }) // validateFunction

      }) // err 
    }) // validateFunction

  },

  _makeGetQuery: function( params, body, options, next ){

    var self = this;
    var sortBy, range, filters;


    if( typeof( next ) !== 'function' ) next = function(){};

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
    // Check the IDs
    self._checkParamIds( params, body, true, function( err ){  
      self._sendErrorOnErr( err, next, function(){
    
        self.checkPermissionsGetQuery( params, body, options, function( err, granted ){
          self._sendErrorOnErr( err, next, function(){
    
            if( ! granted ){
              self._sendError( next, new self.ForbiddenError() );
            } else {
    

              /*     
              // Set reasonable (good) defaults
              sortBy = options.sortBy;
              ranges = options.ranges;
              filters = options.filters;
    					if( typeof( sortBy ) === 'undefined' || ! sortBy ) sortBy = {};
    					if( typeof( ranges ) === 'undefined' || ! ranges ) ranges = {};
              if( typeof( ranges.rangeFrom ) === 'undefined' ) ranges.rangeFrom = 0;
              if( typeof( ranges.rangeTo )   === 'undefined' ) ranges.rangeTo   = 0;
              if( typeof( filters ) === 'undefined' ) filters = {};
              */

 
              self.searchSchema.validate( filters, { onlyObjectValues: true }, function( err, filters, errors ){
                self._sendErrorOnErr( err, next, function(){

                  options.filters = filters;

                  // Errors in casting: give up, run away
                  if( errors.length ){
                    self._sendError( next, new self.BadRequestError( { errors: errors } ) );
                  } else {
        
                    self.execGetDbQuery( params, body, options, function( err, queryDocs ){
                      self._sendErrorOnErr( err, next, function(){
       
                        // It's a normal, cursor-less call
                        if( ! options.cursor ){
        
                          self._extrapolateDocAnd_castDocAndprepareBeforeSendAll( params, body, options, queryDocs, function( err ){
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
        
                        // It's a cursor-enabled call: return it
                        } else {
                          var cursor = queryDocs;
         
                          // Make a wrapper around cursor.next(), so that
                          // anything that comes back from it (except `null`) is
                          // fed through `_extrapolateDocAndCast()` and `_prepareBeforeSend()`
                          var originalNext = cursor.next;
                          cursor.next = function( cb ) {
        
                            originalNext.call( cursor, function( err, fullDoc ) {
                              self._sendErrorOnErr( err, cb, function(){
        
                                if( fullDoc === null ){
                                  cb( null, null );
                                } else {
        
                                  self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                                    self._sendErrorOnErr( err, next, function(){
        
                                      self._castDoc( doc, function( err, doc) {
                                        self._sendErrorOnErr( err, next, function(){
        
                                          self.prepareBeforeSend( doc, function( err, doc ){
                                            self._sendErrorOnErr( err, cb, function(){
                                              cb( null, doc );
                                            });
                                          });
                                        })
                                      })
        
                                    });
                                  });
                                }
        
                              });
                            });
                          }
                             
                          next( null, cursor );
                        }
        
                      })
        
        
                    });
                  }
    
                }) // Err
              })
    
    
            }
    
          })
        })
    
      })
    })
  },


  _makeGet: function( params, body, options, next ){

    var self = this;


    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handleGet ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( params, body, false, function( err ){  
      self._sendErrorOnErr( err, next, function(){

        // Fetch the doc.
        self.execAllDbFetch( params, body, options, function( err, fullDoc ){
          self._sendErrorOnErr( err, next, function(){
    
            if( ! fullDoc ){
              self._sendError( next, new self.NotFoundError());
            } else {
    
              self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                self._sendErrorOnErr( err, next, function(){
    
                  self._castDoc( doc, function( err, doc) {
                    self._sendErrorOnErr( err, next, function(){
        
                      // Check the permissions 
                      self.checkPermissionsGet( params, body, options, doc, fullDoc, function( err, granted ){
                        self._sendErrorOnErr( err, next, function(){
        
                          if( ! granted ){
                            self._sendError( next, new self.ForbiddenError() ); 
                          } else {
                        
        
                            // "preparing" the doc. The same function is used by GET for collections 
                            self.prepareBeforeSend( doc, function( err, doc ){
                              self._sendErrorOnErr( err, next, function(){
        
                                self.afterGet( params, body, options, doc, fullDoc, function( err ) {
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
                                }) // self.afterGet
        
        
                              }) // err
                            }) // self.prepareBeforeSend
        
                          } // granted
        
                        }) // err
                      }) // self.checkPermissionsGet
        
        
                    })
                  }) 
                })
              })
    
            } // if self.fetchedDoc
    
          }) // err
        }) // self.execAllDbFetchDoc

      }) // err
    })
  },


  _makeDelete: function( params, body, options, next ){

    var self = this;
    
    
    if( typeof( next ) !== 'function' ) next = function(){};
    
    // Check the IDs
    self._checkParamIds( params, body, false, function( err ){ 
      self._sendErrorOnErr( err, next, function(){
    
        // Fetch the doc.
        self.execAllDbFetch( params, body, options, function( err, fullDoc ){
          self._sendErrorOnErr( err, next, function(){
    
            if( ! fullDoc ){
              self._sendError( next, new self.NotFoundError());
            } else {
    
              self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                self._sendErrorOnErr( err, next, function(){
    
                  self._castDoc( doc, function( err, doc) {
                    self._sendErrorOnErr( err, next, function(){
        
                      // Check the permissions 
                      self.checkPermissionsDelete( params, body, options, doc, fullDoc, function( err, granted ){
                        self._sendErrorOnErr( err, next, function(){
        
                          if( ! granted ){
                            self._sendError( next, new self.ForbiddenError() );
                          } else {
                      
        
                            // Actually delete the document
                            self.execDeleteDbDelete( params, body, options, function( err ){
                              self._sendErrorOnErr( err, next, function(){
        
                                self.afterDelete( params, body, options, doc, fullDoc, function( err ) {
                                  self._sendErrorOnErr( err, next, function(){
        
                                    // Remote request: send a 204 back
                                    if( self.remote ){
                                      // Return 204 and empty contents as requested by RFC
                                      self._res.send( 204, '' );
        
                                    // Local request: simply return the doc's ID to the asking function
                                    } else {
                                      next( null, doc, self.idProperty );
                                    }
        
                                  })  // err
                                })
        
                              }) // err
                            }) // self.execDeleteDbDelete
        
                          } // granted
        
        
                        }) // err
                      }) // self.checkPermissionsGet
        
                    }) // err
                  }) 
                })
              })
    
            } // if self.fetchedDoc
    
          }) // err
        }) // self.execAllDbFetchDoc
    
      }) // err
    }) // self.execAllDbFetchDoc
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
      // request._enrichOptionsFromClassDefaults( options );

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

  // Enrich `options` with `queryFilterType` and `searchConditions`
  // request._enrichOptionsFromClassDefaults( options );

  // Turn off permissions etc.
  request.checkPermissionsGet = function( params, body, options, doc, fullDoc, cb ){ cb( null, true ); };

  // Actually run the request
  request._makeGet( params, {}, options, next );
}



Store.GetQuery = function( options, next ){

  var Class = this;

  // Make up the request
  var request = new Class();

  // Fix it for the API
  fixRequestForApi( request );

  // Enrich `options` with `queryFilterType` and `searchConditions`
  // request._enrichOptionsFromClassDefaults( options );

  // Turn off permissions etc.
  request.checkPermissionsGetQuery = function( params, body, options, cb ){ cb( null, true ); };

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

  // Sets only idProperty in the params hash. Note that
  // you might well decide to pass the whole object in body, and
  // pass 'null' as the object ID: in that case, this function
  // will sort out `params` with the `id` set
  if( id !== null ){
    params[ request.idProperty ] = id;
  } else {
    var idInBody = body[ request.idProperty ];
    if( typeof( idInBody ) !== 'undefined'){
      params[ request.idProperty ] = body[ request.idProperty ];
    } else {
      throw( new Error("When calling Store.Put with an ID of null, id MUST be in body") );
    }
  }

  // Enrich `options` with `queryFilterType` and `searchConditions`
  // request._enrichOptionsFromClassDefaults( options );

  // Turn off permissions etc.
  request.checkPermissionsPutExisting = function( params, body, options, doc, fullDoc, cb ){ cb( null, true ); };
  request.checkPermissionsPutNew = function(  params, body, options, cb ){ cb( null, true ); };

  // Clone 'body' as _make calls are destructive
  var bodyClone = {}; for( var k in body) bodyClone[ k ] = body[ k ];

  // Actually run the request
  request._makePut( params, bodyClone, options, next );
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

  // Enrich `options` with `queryFilterType` and `searchConditions`
  // request._enrichOptionsFromClassDefaults( options );

  // Turn off permissions etc.
  request.checkPermissionsPost = function( params, body, options, cb ){ cb( null, true ); };

  // Clone 'body' as _make calls are destructive
  var bodyClone = {}; for( var k in body) bodyClone[ k ] = body[ k ];

  // Actually run the request
  request._makePost( {}, bodyClone, options, next );
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

  // Enrich `options` with `queryFilterType` and `searchConditions`
  // request._enrichOptionsFromClassDefaults( options );

  // Turn off permissions etc.
  request.checkPermissionsPostAppend = function( params, body, options, doc, fullDoc, cb ){ cb( null, true ); };

  // Clone 'body' as _make calls are destructive
  var bodyClone = {}; for( var k in body) bodyClone[ k ] = body[ k ];

  // Actually run the request
  request._makePostAppend( params, bodyClone, options, next );
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

  // Enrich `options` with `queryFilterType` and `searchConditions`
  // request._enrichOptionsFromClassDefaults( options );

  // Turn off permissions etc.
  request.checkPermissionsDelete = function( params, body, options, doc, fullDoc, cb ){ cb( null, true ); };

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

// THE FOLLOWING API FUNCTIONS ARE NOT CALLABLE FROM AN ONLINE API

/*
  execAPIDbMassDelete: function( params, body, options, cb ){
    var selector = {};
   
    var self = this;

   
    // Make up the selector based on the query
    selector = self._queryMakeSelector( options.queryFilterType, options.filters, options.searchConditions, {} );

    // Paranoid check. Important since an empty selector WILL lead
    // to table zapping...
    if( Object.keys( selector ).length == 0 && ! options.allowZapping ){
      cb( new Error("Zapping of table not allowed, mass deletion aborted" ) );
    } else {

      // Actually remove the field
      self.collection.remove( selector, function( err, howMany ){
        if( err ) {
          cb( err );
        } else {
          cb( null, howMany );
        }
      });
    }
  },

   execAPIDbMassUpdate: function( params, body, options, cb ){
    var selector = {};
   
    var self = this;
   
    // Make up the selector based on the query
    selector = self._queryMakeSelector( options.queryFilterType, options.filters, options.searchConditions, {} );

    // Actually remove the field
    self.collection.update( selector, { $set: body } , { multi: true },  function( err, howMany ){
      if( err ) {
        cb( err );
      } else {
        cb( null, howMany );
      }
    });
  },

 
  // END OF API FUNCTIONS THAT ARE NOT CALLABLE FROM AN ONLINE API

*/

  /*
  _enrichOptionsFromClassDefaults: function( options ){

    var self = this;

    // Make up  `options.searchConditions` if not already in `options`
    if( typeof( options ) === 'object' && typeof( options.searchConditions) === 'undefined' ){
      options.searchConditions = {};


      Object.keys( self.searchSchema.structure).forEach( function( k ) {

        if( self.searchSchema.structure[ k ].searchPartial ){
          options.searchConditions[ k ] = { type: 'partial' };
        }


        if( self.searchSchema.structure[ 



      });
    }

    // make up options.queryFilterType if not already in `options`
    if( typeof( options ) === 'object' && typeof( options.queryFilterType ) === 'undefined' ){
      if( typeof( self.queryFilterType ) === 'undefined' ){
        options.queryFilterType = 'and';
      } else {
        options.queryFilterType = self.queryFilterType;
      }
    }

  },
  */

/*
Store.MassDelete = function( options, next ){

  var self = this;
  var sortBy, range, filters;

  // Initialise filters
  if( typeof( options.filters) === 'undefined' ) filters = {};
  else filters = options.filters;

  // Create the actual object, so that
  // we get the schema
  var request = new this();

  // Cast filters
  request.searchSchema.validate( filters, { onlyObjectValues: true }, function( err, filters, errors ){
    if( err ){
      next( err );
    } else {

      if( errors.length != 0 ){
        request._sendError( next, new request.BadRequestError( { errors: errors } ) );
      } else {

        // Actually run the mass delete
        request.execAPIDbMassDelete( {}, {}, options, next );
      }
    }
  })

}

Store.MassUpdate = function( body, options, next ){

  var self = this;
  var sortBy, range, filters;

  // Initialise filters
  if( typeof( options.filters) === 'undefined' ) filters = {};
  else filters = options.filters;

  // Create the actual object, so that
  // we get the schema
  var request = new this();

  // Cast filters
  request.searchSchema.validate( filters, { onlyObjectValues: true }, function( err, filters, errors ){
    if( err ){
      next( err );
    } else {

      if( errors.length != 0 ){
        request._sendError( next, new request.BadRequestError( { errors: errors } ) );
      } else {
        // Actually run the mass delete
        request.execAPIDbMassUpdate( {}, body, options, next );
      }
    }

  })

}
*/



