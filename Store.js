
var 
  dummy
, e = require('./Errors')
, declare = require('./declare')
, SimpleSchema = require('./SimpleSchema')
, url = require('url')
;

exports.declare = declare;
exports.Errors = e;

var Store = declare( null,  {

  paramIds: [ ],
  schema: null,

  storeName: null,
 
  handlePut: true,
  handlePost: true,
  handlePostAppend: true,
  handleGet: true,
  handleGetQuery: true,
  handleDelete: true,

  // Default error objects
  BadRequestError: e.BadRequestError,
  UnauthorizedError: e.UnauthorizedError,
  ForbiddenError: e.ForbiddenError,
  NotFoundError: e.NotFoundError,
  ValidationError: e.ValidationError,
  RuntimeError: e.RuntimeError,

  // *** DB manupulation functions (to be overridden by inheriting classes) ***

  extrapolateDoc: function( fullDoc ){
    if( fullDoc === null ) return fullDoc;
    var doc = {};
    for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
    return doc;
  },


  getdbPrepareBeforeSend: function( doc, cb ){
    cb( null, doc );
  },

  allDbFetch: function( reqParams, cb ){
    var doc = { id: 'id', dummyData: 'value'};
    cb( null, doc );
  }, 

  getDbQuery: function( req, res, sortBy, ranges, filters ){

    res.json( 200, [] );
  },

  putDbInsert: function( body, req, doc, fullDoc, cb ){

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

  allDbCheckId: function( id ){ 
    return true; 
  },

  /*
  castId: function( id ){ 
    return id; 
  },
  */

  validate: function( body, errors, cb ){
    cb();
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
  afterPutNew: function( req, doc, fullDoc, overwrite ){
  },
  afterPutExisting: function( req, doc, fullDoc, docAfter, fullDocAfter, overwrite ){
  },

  afterPost: function( req, doc, fullDoc){
  },

  afterPostAppend: function( req, doc, fullDoc, docAfter, fullDocAfter ){
  },

  afterDelete: function( req, doc, fullDoc ){
  },

  afterGet: function( req, doc, fullDoc) {
  },


  _clone: function( obj ){
    return  JSON.parse( JSON.stringify( obj ) );

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

        if( !( skipLast && k == lastItem ) && !self.allDbCheckId( reqParams[k] )  )
          errors.push( { field: k, message: 'Invalid ID in URL: ' + k, mustChange: false } );
      });
    }
  },
 

  _sendError: function( res, error ){
    
    error.errors = typeof( error.errors ) !== 'object' ? null : error.errors;

    var responseBody = this.formatErrorResponse( error );
    var responseStatus = typeof( error.httpError ) === 'undefined' ? 500 : error.httpError;
    res.send( responseStatus, responseBody );
    this.logError( error );
  },

  _makePost: function( req, res, next ){

    var self = this;
    var errors = [];
    var overwrite;
    var body;

    // Check that the method is implemented
    if( ! self.handlePost ){
      self._sendError( res, new e.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( req.params, errors, true );
    if( errors.length ){
      self._sendError( res, new e.BadRequestError( null, errors ) );
      return;
    }
  
    body = this._clone( req.body );
  
    // Do schema and callback functon checks. They will both add to `errors`
    if( self.schema !== null ){
      self.schema.cast(  body );
      self.schema.check( body, req.body, errors, { notRequired: [ '_id' ]}  );
    }

    self.validate( body,  errors, function(){

      if( errors.length ){
        next( new e.ValidationError('Validation problems', errors));
      } else {

        // Actually check permissions
        self.checkPermissionsPost( req, function( err, granted ){
          if( err ){
            self._sendError( res, err );
          } else {
            if( ! granted ){
              next( new e.ForbiddenError() );
            } else {

              // Clean up req.body from things that are not to be submitted
              if( self.schema ) self.schema.cleanup( body );

              self.postDbInsertNoId( body, req, function( err, fullDoc ){

                if( err ){
                  self._sendError( res, err );
                } else {

                  var doc = self.extrapolateDoc( fullDoc );
                  res.send( 202, '' );
                  self.afterPost( body, req, doc, fullDoc );
                } // err
              }) // postDbInsertNoId

            } // granted

          } // err
        }) // checkPermissionsPost

      } // errors.length
    }) // self.validate 


  },

  _makePostAppend: function( req, res, next ){

    var self = this;
    var errors = [];
    var overwrite;
    var body;

    // Check that the method is implemented
    if( ! self.handlePostAppend ){
      self._sendError( res, new e.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( req.params, errors );
    if( errors.length ){
      self._sendError( res, new e.BadRequestError( null, errors ) );
      return;
    }
   
    body = this._clone( req.body );
 
    // Do schema and callback functon checks. They will both add to `errors`
    if( self.schema !== null ){
      self.schema.cast(  body);
      self.schema.check( body, req.body, errors );
    }
    self.validate( body,  errors, function(){

      if( errors.length ){
        next( new e.ValidationError('Validation problems', errors));
      } else {
        // Fetch the doc
        self.allDbFetch( req.params, function( err, fullDoc ){
          if( err ){
            self._sendError( res, err );
          } else {

            // Get the extrapolated doc
            var doc = self.extrapolateDoc( fullDoc );

            // Actually check permissions
            self.checkPermissionsPostAppend( req, doc, fullDoc, function( err, granted ){
              if( err ){
                self._sendError( res, err );
              } else {
                if( ! granted ){
                  next( new e.ForbiddenError() );
                } else {

                  // Clean up req.body from things that are not to be submitted
                  if( self.schema ) self.schema.cleanup( body );

                  self.postDbAppend( body, req, doc, fullDoc, function( err, fullDocAfter ){
                    if( err ){
                      self._sendError( res, err );
                    } else {
  
                      var docAfter = self.extrapolateDoc( fullDoc );
                      res.send( 202, '' );
                      self.afterPostAppend( body, req, doc, fullDoc, docAfter, fullDocAfter );
                    } // err
                  }) // postDbAppend

                } // granted

              } // err
            }) // allDbFetch

          } // err
        }) // checkPermissionsPostAppend
   
      } // errors.length
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
      self._sendError( res, new e.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( req.params, errors );
    if( errors.length ){
      self._sendError( res, new e.BadRequestError( null, errors ) );
      return;
    }
    
    body = this._clone( req.body );

    // Do schema and callback functon checks. They will both add to `errors`
    if( self.schema !== null ){
      self.schema.cast(  body );
      self.schema.check( body, req.body, errors );
    }
    self.validate( body,  errors, function(){

      if( errors.length ){
        next( new e.ValidationError('Validation problems', errors));
      } else {

        // Fetch the doc
        self.allDbFetch( req.params, function( err, fullDoc ){
          if( err ){
            self._sendError( res, err );
          } else {
   
            // Check the 'overwrite' option
            if( typeof( overwrite ) !== 'undefined' ){
              if( fullDoc && ! overwrite ){
                self._sendError( res, new e.PreconditionFailedError() );
              } else if( !fullDoc && overwrite ) {
                self._sendError( res, new e.PreconditionFailedError() );
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
                  if( err ){
                    self._sendError( res, err );
                  } else {
                    if( ! granted ){
                      next( new e.ForbiddenError() );
                    } else {

                      // Clean up req.body from things that are not to be submitted
                      if( self.schema ) self.schema.cleanup( body );

                      // At this point, if `doc` is set it's an existing document. If it's not set,
                      // it's a new one. It's important to mark the difference as most DB layers
                      // will have different commands
                      self.putDbInsert( body, req, function( err, fullDoc ){
                        if( err ){
                          self._sendError( res, err );
                         } else {

                           // Update "doc" to be the complete version of the doc from the DB
                           var doc = self.extrapolateDoc( fullDoc );

                           // All good, send a 202
                           res.send( 202, '' );
                           self.afterPutNew( body, req, doc, fullDoc, overwrite );
                        }
                      })
                    }
                  }
                })


              // It's an EXISTING doc: it will need to be an update, _and_ permissions will be
              // done on inputted data AND existing doc
              } else {

                var doc = self.extrapolateDoc( fullDoc );

                // Actually check permissions
                self.checkPermissionsPutExisting( req, doc, fullDoc, function( err, granted ){
                  if( err ){
                    self._sendError( res, err );
                  } else {
                    if( ! granted ){
                      next( new e.ForbiddenError() );
                    } else {

                      // Clean up req.body from things that are not to be submitted
                      if( self.schema ) self.schema.cleanup( body );

                      // At this point, if `doc` is set it's an existing document. If it's not set,
                      // it's a new one. It's important to mark the difference as most DB layers
                      // will have different commands
                      self.putDbUpdate(body, req, function( err, fullDocAfter ){
                        if( err ){
                          self._sendError( res, err );
                         } else {

                           // Update "doc" to be the complete version of the doc from the DB
                           var docAfter = self.extrapolateDoc( fullDocAfter );

                           // All good, send a 202
                           res.send( 202, '' );
                           self.afterPutExisting( body, req, doc, docAfter, fullDoc, fullDocAfter, overwrite );
                        }
                      })
                    }
                  }
                })
              }
            }
    
          } // err
        }) // allDbFetch

   
      } // if( errors.length )

    }) 

  },

  _makeGetQuery: function( req, res, next ){

    var self = this;
    var errors = [];
    var sortBy, range, filters;

    // Check that the method is implemented
    if( ! self.handleGetQuery ){
      self._sendError( res, new e.NotImplementedError( ) );
      return;
    }
   
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( req.params, errors, true );
    if( errors.length ){
      self._sendError( res, new e.BadRequestError( null, errors ) );
      return;
    }
    
    // The schema must be defined for queries. It's too important, as it defines
    // what's searchable and what's sortable
    if( self.schema == null ){
      self._sendError( res, new e.RuntimeError( 'Query attempted on schema-less store', errors ) );
      return;
    }

    sortBy = parseSortBy( req );
    ranges = parseRangeHeaders( req );
    filters = parseFilters( req );

    // console.log( sortBy );
    // console.log( ranges );
    // console.log( filters );
   
    this.getDbQuery( req, res, sortBy, ranges, filters );

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
      self.schema.cast( result );

      return result;
    }

    
     


  },

  _makeGet: function( req, res, next ){

    var self = this;
    var errors = [];

    // Check that the method is implemented
    if( ! self.handleGet ){
      self._sendError( res, new e.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( req.params, errors );
 
    // There was a problem: return the errors
    if( errors.length ){
      self._sendError( res, new e.BadRequestError( null, errors ) );
      return;
    }

    // Fetch the doc.
    self.allDbFetch( req.params, function( err, fullDoc ){
      if( err ){
        self._sendError( res, err );
      } else {

        if( ! fullDoc ){
          self._sendError( res, new e.NotFoundError());
        } else {

          var doc = self.extrapolateDoc( fullDoc );

          // Check the permissions 
          self.checkPermissionsGet( req, doc, fullDoc, function( err, granted ){
            if( err ){
              self._sendError( res, err );
            } else {

              if( ! granted ){
                next( new e.ForbiddenError() );
              } else {
                
                // "preparing" the doc. The same function is used by GET for collections 
                self.getDbPrepareBeforeSend( doc, function( err, doc ){
                  if( err ){
                    self._sendError( res, err );
                  } else {
                   
                    // Send "prepared" doc
                    res.json( 200, doc );

                    self.afterGet( req, doc, fullDoc );
                  } 
                })
              }



            }
          }) // self.checkPermissionsGet

        } // if self.fetchedDoc

      } // if ! err

    }) // self.allDbFetchDoc
  },


  _makeDelete: function( req, res, next ){

    var self = this;
    var errors = [];

    // Check that the method is implemented
    if( ! self.handleDelete ){
      self._sendError( res, new e.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( req.params, errors );
 
    // There was a problem: return the errors
    if( errors.length ){
      self._sendError( res, new e.BadRequestError( null, errors ) );
      return;
    }

    // Fetch the doc.
    self.allDbFetch( req.params, function( err, fullDoc ){
      if( err ){
        self._sendError( res, err );
      } else {

        if( ! fullDoc ){
          self._sendError( res, new e.NotFoundError());
        } else {

          var doc = self.extrapolateDoc( fullDoc );

          // Check the permissions 
          self.checkPermissionsDelete( req, doc, fullDoc, function( err, granted ){
            if( err ){
              self._sendError( res, err );
            } else {

              if( ! granted ){
                next( new e.ForbiddenError() );
              } else {
                
                // Actually delete the document
                self.deleteDbDo( req.params, function( err ){
                  if( err ){
                    self._sendError( res, err );
                  } else {
                   
                    // Return 204 and empty contents as requested by RFC
                    res.json( 204, '' );

                    self.afterDelete( req, doc, fullDoc );
                  } 
                })
              }


            }
          }) // self.checkPermissionsGet

        } // if self.fetchedDoc

      } // if ! err

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

// Make Store.makeGet, Store.makeGetQuery, etc.
[ 'Get', 'GetQuery', 'Put', 'Post', 'PostAppend', 'Delete' ].forEach( function(mn){
  Store[ 'make' + mn ] = function( Class ){
    return function( req, res, next ){
      var request = new Class();
      request['_make' + mn ]( req, res, next );
      
    }
  }
})

Store.makeAll = function( app, url, idName, Class ){
  app.get(      url + idName, Store.makeGet( Class ) );
  app.get(      url,          Store.makeGetQuery( Class ) );
  app.put(      url + idName, Store.makePut( Class ) );
  app.post(     url,          Store.makePost( Class ) );
  app.post(     url + idName, Store.makePostAppend( Class ) );
  app.delete(   url + idName, Store.makeDelete( Class ) );
}

exports = module.exports = Store;
