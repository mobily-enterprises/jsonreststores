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
  idProperty: 'id',

  storeName: null,
 
  handlePut: true,
  handlePost: true,
  handlePostAppend: true,
  handleGet: true,
  handleGetQuery: true,
  handleDelete: true,

  echoAfterPutNew: false,
  echoAfterPutExisting: false,
  echoAfterPost: false,
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

  // *** DB manupulation functions (to be overridden by inheriting classes) ***

  allDbExtrapolateDoc: function( fullDoc, req, cb ){
    cb( null, fullDoc );
  },


  getDbPrepareBeforeSend: function( doc, cb ){
    cb( null, doc );
  },

  allDbFetch: function( req, cb ){
    var doc = { id: 'id', dummyData: 'value'};
    cb( null, doc );
  }, 

  getDbQuery: function( req, res, next, sortBy, ranges, filters ){

    res.json( 200, [] );
  },

  putDbInsert: function( body, req, cb ){

    cb( null, doc );
  },

  putDbUpdate: function( body, req, doc, fullDoc, cb ){
    cb( null, doc );
  },

  postDbInsertNoId: function( body, req, cb ){
    cb( null, doc );
  },

  postDbAppend: function( body, req, doc, fullDoc, cb ){
    cb( null, doc );
  },

  deleteDbDo: function( id, cb ){
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
  afterPutNew: function( req, body, doc, fullDoc, overwrite, cb ){
    cb( null )
  },
  afterPutExisting: function( req, body, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){
    cb( null )
  },

  afterPost: function( req, body, doc, fullDoc, cb){
    cb( null );
  },

  afterPostAppend: function( doc, body, doc, fullDoc, docAfter, fullDocAfter, cb ){
    cb( null );
  },

  afterDelete: function( req, doc, fullDoc, cb ){
    cb( null );
  },

  afterGet: function( req, doc, fullDoc, cb ) {
    cb( null );
  },


  _clone: function( obj ){
    return  JSON.parse( JSON.stringify( obj ) );
  },


  _extrapolateAndPrepareAll: function( docs, req, cb ){

    var self = this;

    var changeFunctions = [];
    docs.forEach( function( fullDoc, index ){

      changeFunctions.push( function( callback ){

        self.allDbExtrapolateDoc( fullDoc, req, function( err, extrapolatedDoc ){
          if( err ){
            callback( err, null );
          } else {

            self.getDbPrepareBeforeSend( extrapolatedDoc, function( err, preparedDoc ){
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


   _checkId: function( id ){ 
    return true; 
  },

  _castId: function( id ){ 
    return id; 
  },

  

  // *** Internal, protected calls that should't be changed by users ***

  _checkParamIds: function( reqParams, errors, skipLast ){
    var self = this;
    var lastItem;
    // Check that paramsId are actually legal IDs. 

    if( self.paramIds.length === 0 ) return;
   
    lastItem = self.paramIds[ self.paramIds.length - 1];

    if( self.paramIds ){
      self.paramIds.forEach( function(k){

        // Check that every ID passed is actually correct
        if( !( skipLast && k == lastItem ) && !self._checkId( reqParams[ k ] )  )
          errors.push( { field: k, message: 'Invalid ID in URL: ' + k, mustChange: false } );

        // Cast all IDs in req.params. This will make it much easier to use ID elements
        // in req.params in MongoDb queries
        reqParams[ k ] = self._castId( reqParams[ k ] );

      });
    }
  },
 
  _sendErrorOnErr: function( err, res, next, cb ){
    if( err ) {
      this._sendError( res, next, err );
    } else {
      cb();
    }
  },

  _sendError: function( res, next, error ){

    var self = this;

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
          res.send( error.httpError, responseBody );
        }
      break;

    }
 
    self.logError( error );
  },

  _makePost: function( req, res, next ){

    var self = this;
    var errors = [];
    var overwrite;
    var body;

    // Check that the method is implemented
    if( ! self.handlePost ){
      self._sendError( res, next, new self.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( req.params, errors, true );
    if( errors.length ){
      self._sendError( res, next, new self.BadRequestError( { errors: errors }  ) );
      return;
    }
  
    body = self._clone( req.body );
  
    // Do schema cast and check
    if( self.schema !== null ){
      self.schema.apply(  body, errors, { notRequired: [ self.idProperty ]} );
    }

    var validateFunction = function( body, errors, cb ) { cb( null ) }
    if( typeof( self.schema ) !== 'undefined' ){ validateFunction = self.schema.validate; }



    validateFunction.call( self.schema, body,  errors, function( err ){
      self._sendErrorOnErr( err, res, next, function(){

        if( errors.length ){
          self._sendError( res, next, new self.UnprocessableEntityError( { errors: errors } ) );
        } else {

          // Actually check permissions
          self.checkPermissionsPost( req, function( err, granted ){
            self._sendErrorOnErr( err, res, next, function(){

              if( ! granted ){
                self._sendError( res, next, new self.ForbiddenError() );
              } else {

                // Clean up req.body from things that are not to be submitted
                if( self.schema ) self.schema.cleanup( body, 'doNotSave' );

                self.postDbInsertNoId( body, req, function( err, fullDoc ){
                  self._sendErrorOnErr( err, res, next, function(){

                    self.allDbExtrapolateDoc( fullDoc, req, function( err, doc) {
                      self._sendErrorOnErr( err, res, next, function(){


                        self.afterPost( req, body, doc, fullDoc, function( err ){
                          self._sendErrorOnErr( err, res, next, function(){


                            res.setHeader( 'Location', req.originalUrl + doc[ self.idProperty ] );

                            if( self.echoAfterPost ){
                              self.getDbPrepareBeforeSend( doc, function( err, doc ){
                                res.json( 201, doc );
                              })
                            } else {
                              res.send( 201, '' );
                            }

                          }) // err
                        }) // self.afterPost
                       
                      }) // err
                    })


                  }) // err
                }) // postDbInsertNoId

              } // granted

            }) // err
          }) // checkPermissionsPost

        } // errors.length

      }) // err
    }) // validate()


  },

  _makePostAppend: function( req, res, next ){

    var self = this;
    var errors = [];
    var overwrite;
    var body;

    // Check that the method is implemented
    if( ! self.handlePostAppend ){
      self._sendError( res, next, new self.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( req.params, errors );
    if( errors.length ){
      self._sendError( res, next, self.BadRequestError( { errors: errors } ) );
      return;
    }
   
    body = self._clone( req.body );

    // Do schema cast and check
    if( self.schema !== null ){
      self.schema.apply(  body, errors );
    }
 

    var validateFunction = function( body, errors, cb ) { cb( null ) }
    if( typeof( self.schema ) !== 'undefined' ){ validateFunction = self.schema.validate; }

    validateFunction.call( self.schema, body,  errors, function( err ){
      self._sendErrorOnErr( err, res, next, function(){

        if( errors.length ){
          self._sendError( res, next, new self.UnprocessableEntityError( { errors: errors } ) );
        } else {
          // Fetch the doc
          self.allDbFetch( req, function( err, fullDoc ){
            self._sendErrorOnErr( err, res, next, function(){

              // Get the extrapolated doc
              self.allDbExtrapolateDoc( fullDoc, req, function( err, doc ){
                self._sendErrorOnErr( err, res, next, function(){

                  // Actually check permissions
                  self.checkPermissionsPostAppend( req, doc, fullDoc, function( err, granted ){
                    self._sendErrorOnErr( err, res, next, function(){

                      if( ! granted ){
                        self._sendError( res, next, new self.ForbiddenError() );
                      } else {

                        // Clean up req.body from things that are not to be submitted
                        if( self.schema ) self.schema.cleanup( body, 'doNotSave' );

                        // Paranoid check
                        // Make sure that the id property in the body does match
                        // the one passed as last parameter in the list of IDs
                        body[ self.idProperty ] = req.params[self.paramIds[ self.paramIds.length - 1 ]];

                        self.postDbAppend( body, req, doc, fullDoc, function( err, fullDocAfter ){
                          self._sendErrorOnErr( err, res, next, function(){
  
                            self.allDbExtrapolateDoc( fullDoc, req, function( err, docAfter ){
                              self._sendErrorOnErr( err, res, next, function(){

                                self.afterPostAppend( req, body, doc, fullDoc, docAfter, fullDocAfter, function( err ){
                                  self._sendErrorOnErr( err, res, next, function(){

                                    if( self.echoAfterPostAppend ){
                                       self.getDbPrepareBeforeSend( docAfter, function( err, docAfter ){
                                         res.json( 200, docAfter );
                                       })
                                    } else { 
                                      res.send( 204, '' );
                                    }

                                  }) // err
                                }) // self.afterPostAppend

                              }) // err
                            }); // self.allDbExtrapolateDoc

                          }) // err
                        }) // postDbAppend

                      } // granted


                    }) // err
                  }) // allDbExtrapolateDoc 

                }) // err
              }) // allDbFetch

            }) // err
          }) // checkPermissionsPostAppend
   
        } // errors.length

      }) // err
    }) // self.validate

  },


  _makePut: function( req, res, next ){

    var self = this;
    var errors = [];
    var overwrite;
    var body;

    if( req.headers[ 'if-match' ] === '*' )
      overwrite = true;
    if( req.headers[ 'if-none-match' ] === '*' )
      overwrite = false;

    // Check that the method is implemented
    if( ! self.handlePut ){
      self._sendError( res, next, new self.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( req.params, errors );
    if( errors.length ){
      self._sendError( res, next, self.BadRequestError( { errors: errors }  ) );
      return;
    }
    
    body = self._clone( req.body );

    // Do schema cast and check
    if( self.schema !== null ){
      self.schema.apply(  body, errors );
    }

    var validateFunction = function( body, errors, cb ) { cb( null ) }
    if( typeof( self.schema ) !== 'undefined' ){ validateFunction = self.schema.validate; }

    validateFunction.call( self.schema, body,  errors, function( err ){
      self._sendErrorOnErr( err, res, next, function(){

        if( errors.length ){
          self._sendError( res, next, new self.UnprocessableEntityError( { errors: errors } ) );
        } else {

          // Fetch the doc
          self.allDbFetch( req, function( err, fullDoc ){
            self._sendErrorOnErr( err, res, next, function(){
  
 
              // Check the 'overwrite' option
              if( typeof( overwrite ) !== 'undefined' ){
                if( fullDoc && ! overwrite ){
                  self._sendError( res, next, new self.PreconditionFailedError() );
                } else if( !fullDoc && overwrite ) {
                  self._sendError( res, next, new self.PreconditionFailedError() );
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
                  self.checkPermissionsPutNew( req, function( err, granted ){
                    self._sendErrorOnErr( err, res, next, function(){


                      if( ! granted ){
                        self._sendError( res, next, new self.ForbiddenError() );
                      } else {

                        // Clean up req.body from things that are not to be submitted
                        if( self.schema ) self.schema.cleanup( body, 'doNotSave' );

                        // Paranoid check
                        // Make sure that the id property in the body does match
                        // the one passed as last parameter in the list of IDs
                        body[ self.idProperty ] = req.params[self.paramIds[ self.paramIds.length - 1 ]];

                        self.putDbInsert( body, req, function( err, fullDoc ){
                          self._sendErrorOnErr( err, res, next, function(){

                            // Update "doc" to be the complete version of the doc from the DB
                            self.allDbExtrapolateDoc( fullDoc, req, function( err, doc ){
                              self._sendErrorOnErr( err, res, next, function(){

                                self.afterPutNew( req, body, doc, fullDoc, overwrite, function( err ){
                                  self._sendErrorOnErr( err, res, next, function(){

                                    res.setHeader( 'Location', req.originalUrl + doc[ self.idProperty ] );

                                    if( self.echoAfterPutNew ){
                                      self.getDbPrepareBeforeSend( doc, function( err, doc ){
                                        res.json( 201, doc );
                                      })
                                    } else {
                                      res.send( 201, '' );
                                    }

                                  }) // err
                                }) // self.afterPutNew

                              }) // err
                            }) // self.allDbExtrapolateDoc
                        
                          }) // err
                        }) // putDbInsert

                      } // granted

                    }) // err
                  }) // checkPermissionsPutNew


                // It's an EXISTING doc: it will need to be an update, _and_ permissions will be
                // done on inputted data AND existing doc
                } else {

                  self.allDbExtrapolateDoc( fullDoc, req, function( err, doc ){
                    self._sendErrorOnErr( err, res, next, function(){

                      // Actually check permissions
                      self.checkPermissionsPutExisting( req, doc, fullDoc, function( err, granted ){
                        self._sendErrorOnErr( err, res, next, function(){

                          if( ! granted ){
                            self._sendError( res, next, new self.ForbiddenError() );
                          } else {

                            // Clean up req.body from things that are not to be submitted
                            if( self.schema ) self.schema.cleanup( body, 'doNotSave' );

                            self.putDbUpdate(body, req, doc, fullDoc, function( err, fullDocAfter ){
                              self._sendErrorOnErr( err, res, next, function(){

                                // Update "doc" to be the complete version of the doc from the DB
                                self.allDbExtrapolateDoc( fullDocAfter, req, function( err, docAfter ){
                                  self._sendErrorOnErr( err, res, next, function(){

                                    res.setHeader( 'Location', req.originalUrl + doc[ self.idProperty ] );

                                    self.afterPutExisting( req, body, doc, docAfter, fullDoc, fullDocAfter, overwrite, function( err ) {
                                      self._sendErrorOnErr( err, res, next, function(){

                                        if( self.echoAfterPutExisting ){
                                          self.getDbPrepareBeforeSend( docAfter, function( err, docAfter ){
                                            res.json( 200, docAfter );
                                          })
                                        } else {
                                          res.send( 200, '' );
                                          //res.send( 204, 'OK' );
                                        }
                                      }) // err
                                    }) // self.afterPutExisting
 

                                  }) // err
                                }) // self.allDbExtrapolateDoc

                              }) // err
                            }) // self.putDbUpdate

                          } // granted

                        }) // err
                      }) // self.checkPermissionsPutExisting

                    }) // err
                  }) // self.allDbExtrapolateDoc
                }

              } // function continueAfterFetch()
    
            }) // err
          }) // allDbFetch

        } // if errors.length  

      }) // err 
    }) // validateFunction

  },

  _makeGetQuery: function( req, res, next ){

    var self = this;
    var errors = [];
    var sortBy, range, filters;

    // Check that the method is implemented
    if( ! self.handleGetQuery ){
      self._sendError( res, next, new self.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( req.params, errors, true );
    if( errors.length ){
      self._sendError( res, next, self.BadRequestError( { errors: errors } ) );
      return;
    }
    
    // The schema must be defined for queries. It's too important, as it defines
    // what's searchable and what's sortable
    if( self.schema == null ){
      self._sendError( res, next, new Error('Query attempted on schema-less store' ) );
      return;
    }

    sortBy = parseSortBy( req );
    ranges = parseRangeHeaders( req );
    filters = parseFilters( req );

    // console.log( sortBy );
    // console.log( ranges );
    // console.log( filters );
   
    self.getDbQuery( req, res, next, sortBy, ranges, filters );

    function parseSortBy(){

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


    function parseFilters(){

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

  _makeGet: function( req, res, next ){

    var self = this;
    var errors = [];

    // Check that the method is implemented
    if( ! self.handleGet ){
      self._sendError( res, next, new self.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( req.params, errors );
 
    // There was a problem: return the errors
    if( errors.length ){
      self._sendError( res, next, self.BadRequestError( { errors: errors } ) );
      return;
    }

    // Fetch the doc.
    self.allDbFetch( req, function( err, fullDoc ){
      self._sendErrorOnErr( err, res, next, function(){

        if( ! fullDoc ){
          self._sendError( res, next, new self.NotFoundError());
        } else {

          self.allDbExtrapolateDoc( fullDoc, req, function( err, doc ){
            self._sendErrorOnErr( err, res, next, function(){

              // Check the permissions 
              self.checkPermissionsGet( req, doc, fullDoc, function( err, granted ){
                self._sendErrorOnErr( err, res, next, function(){

                  if( ! granted ){
                    self._sendError( res, next, new self.ForbiddenError() ); 
                  } else {
                
                    self.afterGet( req, doc, fullDoc, function( err ) {
                      self._sendErrorOnErr( err, res, next, function(){

                        // "preparing" the doc. The same function is used by GET for collections 
                        self.getDbPrepareBeforeSend( doc, function( err, doc ){
                          self._sendErrorOnErr( err, res, next, function(){
                   
                            // Send "prepared" doc
                            res.json( 200, doc );
                          }) // err
                        }) // self.getDbPrepareBeforeSend

                      }) // err
                    }) // self.afterGet

                  } // granted

                }) // err
              }) // self.checkPermissionsGet


            }) // err
          }) // self.allDbExtrapolateDoc

        } // if self.fetchedDoc

      }) // err
    }) // self.allDbFetchDoc
  },


  _makeDelete: function( req, res, next ){

    var self = this;
    var errors = [];

    // Check that the method is implemented
    if( ! self.handleDelete ){
      self._sendError( res, next, new self.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( req.params, errors );
 
    // There was a problem: return the errors
    if( errors.length ){
      self._sendError( res, next, self.BadRequestError( { errors: errors } ) );
      return;
    }

    // Fetch the doc.
    self.allDbFetch( req, function( err, fullDoc ){
      self._sendErrorOnErr( err, res, next, function(){

        if( ! fullDoc ){
          self._sendError( res, next, new self.NotFoundError());
        } else {

          self.allDbExtrapolateDoc( fullDoc, req, function( err, doc ){
            self._sendErrorOnErr( err, res, next, function(){


              // Check the permissions 
              self.checkPermissionsDelete( req, doc, fullDoc, function( err, granted ){
                self._sendErrorOnErr( err, res, next, function(){

                  if( ! granted ){
                    self._sendError( res, next, new self.ForbiddenError() );
                  } else {
              
                    self.afterDelete( req, doc, fullDoc, function( err ) {
                      self._sendErrorOnErr( err, res, next, function(){

                        // Actually delete the document
                        self.deleteDbDo( req.params, function( err ){
                          self._sendErrorOnErr( err, res, next, function(){
                   
                            // Return 204 and empty contents as requested by RFC
                            res.send( 204, '' );
                          })  // err
                        })

                      }) // err
                    }) // self.afterDelete

                  } // granted


                }) // err
              }) // self.checkPermissionsGet

            }) // err
          }) // self.allDbExtrapolateDoc

        } // if self.fetchedDoc

      }) // err
    }) // self.allDbFetchDoc

  },

  // Permission stock functions
  checkPermissionsPost: function( req, cb ){
    cb( null, true );
  },
  checkPermissionsPostAppend: function( req, doc, fullDoc, cb ){
    cb( null, true );
  },
  checkPermissionsPutNew: function( req, cb ){
    cb( null, true );
  },
  checkPermissionsPutExisting: function( req, doc, fullDoc, cb ){
    cb( null, true );
  },
  checkPermissionsGet: function( req, doc, fullDoc, cb ){
    cb( null, true );
  },
  checkPermissionsDelete: function( req, doc, fullDoc, cb ){
    cb( null, true );
  },

});


// Make up the class method "make"
Store.make = {};

// Make Store.makeGet, Store.makeGetQuery, etc.
[ 'Get', 'GetQuery', 'Put', 'Post', 'PostAppend', 'Delete' ].forEach( function(mn){
  Store.make[mn] = function( Class ){
    return function( req, res, next ){
      var request = new Class();
      request['_make' + mn ]( req, res, next );
      
    }
  }
})


Store.make.All = function( app, url, idName, Class ){
  app.get(      url + idName, Store.make.Get( Class ) );
  app.get(      url,          Store.make.GetQuery( Class ) );
  app.put(      url + idName, Store.make.Put( Class ) );
  app.post(     url,          Store.make.Post( Class ) );
  app.post(     url + idName, Store.make.PostAppend( Class ) );
  app.delete(   url + idName, Store.make.Delete( Class ) );
}

Store.Schema = Schema;

exports = module.exports = Store;
