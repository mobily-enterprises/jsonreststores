
/*
Copyright (C) 2013 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*

  TODO:
Tests for:
  logError: function( error ){  },
  formatErrorResponse: function( error ){
*/

var 
  dummy

, J = require('jsonreststores')
, declare = require('simpledeclare')
, SimpleDbLayer = require('simpledblayer')
, MongoMixin = require('simpledblayer-mongo')
, mw = require('mongowrapper')
, async = require('async')
, Schema = require('simpleschema')
;

function makeReq( params ){
  var req = {};

  req.url = "http://www.example.com/";
  req.headers = {};
  req.params = {}; 
  req.body = {};

  [ 'url', 'headers', 'params', 'body' ].forEach( function( k ){
    if( params[ k ] ) req[ k ] = params[ k ];
  });

  req.originalUrl = req.url;

  return req;

}

var RES = function( func ){

  this._headers = {};

  this.send = function( status, data ){
    func.call( this, null, 'bytes', this._headers, status, data );
  };

  this.json = function( status, data ){
    func.call( this, null, 'json', this._headers, status, data );
  };

  this.setHeader = function( header, value ){
    this._headers[ header ] = value;
  };



}

var peopleData = exports.peopleData = [
  { name: 'Chiara',    surname: 'Mobily',     age: 22 },
  { name: 'Tony',      surname: 'Mobily',     age: 37 },
  { name: 'Sara',      surname: 'Connor',     age: 14 },
  { name: 'Daniela',   surname: 'Mobily',     age: 64 },
];


function l( v ){
  console.log( require( 'util' ).inspect( v, { depth: 10 } ) );
}

var compareCollections = function( test, a, b ){

  try {
    var a1 = [], a2, a3;
    a.forEach( function( item ){
      a1.push( JSON.stringify( item ) );
    });
    a2 = a1.sort();
    a3 = JSON.stringify( a2 );

    var b1 = [], b2, b3;
    b.forEach( function( item ){
      b1.push( JSON.stringify( item ) );
    });
    b2 = b1.sort();
    b3 = JSON.stringify( b2 );
  } catch ( e ){
    test.fail( a, b, "Comparison failed", "recordset comparison" );
  }

  var res = ( a3 == b3 );

  if( ! res ){
    test.fail( a, b, "Record sets do not match", "recordset comparison" );
  }
}

var populateCollection = function( data, collection, cb ){

  var functions = [];

  // Populate the database
  data.forEach( function( datum ){

    functions.push( function( done ){
      collection.insert( datum, function( err ){
        if( err ){
          cb( err );
        } else{
          done( null );
        }
      })
    })

  })

  async.series( functions, function( err, res ){
    if( err ){
      cb( err );
    } else {
      cb( null );
    }
  });
}


var clearAndPopulateTestCollection = function( g, cb ){
  
  g.people.delete( { }, { multi: true }, function( err ){
   if( err ){
      cb( err );
    } else {

      populateCollection( peopleData, g.people, function( err ){
        if( err ){
          cb( err );
        } else {

          cb( null );

        }
      })
    }
  })
}



process.on('uncaughtException', function(err) {
  console.error(err.stack);
});

//Error.stackTraceLimit = Infinity;

exports.get = function( getDbAndDbDriverAndJRS, closeDb ){
  
  var tests;
  var g = {};

  var startup = function( done ){
    var self = this;


    process.on('uncaughtException', function(err) {
      console.error(err.stack);
    });


    getDbAndDbDriverAndJRS( function( err, db, DbDriver, JRS ){
      if( err ){
        throw( new Error("Could not connect to db, aborting all tests") );
        process.exit();
      }

      // Set the important g.driver variables (db and DriverMixin)
      g.db = db;
      g.DbDriver = DbDriver;
      g.JRS = JRS;

      // Set the basic stores
      g.People = declare( g.JRS, {

        schema: new Schema({
          id:          { type: 'id', required: true },
          name:        { type: 'string' },
          surname:     { type: 'string', max: 20 },
          age:         { type: 'number', max: 99 },
          extra:       { type: 'string', max: 99, doNotSave: true },
        }),

        searchSchema: new Schema({
          name:     { type: 'string', filterType: { type: 'eq' }  },
          surname:  { type: 'string', max: 20, filterType: { type: 'eq'  } },
          age:      { type: 'number', max: 99, filterType: { type: 'eq' } },
          ageGt:    { type: 'number', max: 99, filterType: { field: 'age', type: 'gt' } },
          nameSt:   { type: 'string', filterType: { field: 'surname', type: 'startsWith' } },
        }),

        storeName: 'people',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        paramIds: [ 'id' ],
      });
     
      // Set the basic stores
      g.WsPeople = declare( g.JRS, {

        schema: new Schema({
          id:          { type: 'id', required: true },
          workspaceId: { type: 'id', required: true },
          name:        { type: 'string' },
          surname:     { type: 'string', max: 20 },
          age:         { type: 'number', max: 99 },
          extra:       { type: 'string', max: 99, doNotSave: true },
        }),

        searchSchema: new Schema({
          name:     { type: 'string', filterType: { type: 'eq' }  },
          surname:  { type: 'string', max: 20, filterType: { type: 'eq'  } },
          age:      { type: 'number', max: 99, filterType: { type: 'eq' } },
          ageGt:    { type: 'number', max: 99, filterType: { field: 'age', type: 'gt' } },
          nameSt:   { type: 'string', filterType: { field: 'surname', type: 'startsWith' } },
        }),

        storeName: 'wsPeople',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        paramIds: [ 'workspaceId', 'id' ],
      });
     

      // Clear people table
        //g.dbPeople = new g.DbDriver( 'people', {  name: true, surname: true, age: false, id: true }  ); 
        g.dbPeople = new g.People().dbDriver;
        g.dbPeople.delete( { }, { multi: true }, function( err ){
          if( err ){
            throw( new Error("Could not empty people database, giving up") );
            process.exit();
          } else {
   
            // Clear people table
            //g.dbPeople = new g.DbDriver( 'people', {  name: true, surname: true, age: false, id: true }  ); 
            g.dbWsPeople = new g.WsPeople().dbDriver;
            g.dbWsPeople.delete( { }, { multi: true }, function( err ){
              if( err ){
                throw( new Error("Could not empty wsPeople database, giving up") );
                process.exit();
              } else {
                if( typeof done === 'object') done.done();
                else done();
              }
            });
          };
        });
  
      });
    }
  
  
    var finish = function( test ){
      var self = this;
      closeDb( g.db, function( err ){
        if( err ){
          throw( new Error("There was a problem disconnecting to the DB") );
        }
        test.done();
      });
    };
  
  
    var console_log = console.log;
    console.log2 = function( m ){
      console_log("I WAS CALLED:");
      console_log( m );
      console_log( new Error().stack );
    }
  
  
    function zap( done ){
      g.dbPeople.delete( { }, { multi: true }, function( err ){
        if( err ){
          done( err );
        } else {
  
          g.dbWsPeople.delete( { }, { multi: true }, function( err ){
            if( err ){
              done( err );
            } else {
              done();
            }
          })
        }
      });
    }
  
    tests = {
  
      startup: startup,
  
      // *********************************
      // ********** POST *****************
      // *********************************
  
      /* POST:
         * REST  handlePost
         * REST  checkParamIds
         * APIh  prepareBodyPost
         * APIg  validate
         * REST  checkPermissionsPost
         * APIg  cleanup
         * APIh  extrapolateDoc
         * APIg  castDoc
         * REST  echoAfterPost
         * REST/APIh prepareBeforeSend
         * REST/APIh afterPost
      */
  
      'Post() API Working test': function( test ){
        zap( function(){
  
          g.People.Post( { name: 'Tony', surname: "Mobily", age: 37 }, function( err, person ){
            test.ifError( err );
  
            g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
              test.ifError( err );
              test.deepEqual( data[ 0 ], person );
  
              test.done();
            });
          });
        });
      },
  
      'Post() REST Working test': function( test ){
        zap( function(){
  
          var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
          (g.People.online.Post(g.People))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
            var res = this;
  
            test.equal( type, 'json' );
            test.equal( status, 201 );
            test.equal( headers.Location, 'http://www.example.com/' + data.id );
            test.equal( data.name, 'Tony' );
            test.equal( data.surname, 'Mobily' );
            test.ok( data.id );
  
            test.done();
          }))
        });
      },
  
  
      'Post() REST handlePost': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            handlePost: false,
          });
   
          var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
          (People2.online.Post(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
            test.equal( type, 'bytes' );
            test.equal( status, 501 );
  
            test.done();
          }));
        });
      },
  
      'Post() REST checkParamIds': function( test ){
        zap( function(){
  
          var req = makeReq( { params: { }, body: { name: 'Tony', surname: 'Mobily' } } );
          (g.WsPeople.online.Post(g.WsPeople))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 400 );
            test.deepEqual( data,
  
  { message: 'Bad Request',
    errors: 
     [ { field: 'workspaceId',
         message: 'Field required in the URL: workspaceId' } ] }
            );
   
  
            test.done();
          }))
        });
      },
  
      'Post() APIh prepareBodyPost': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
  
            prepareBodyPost: function( body, done ){
              body.name = body.name + "_prepareBodyPost";
              done( null, body );
            },
  
          });
  
          // Set the basic stores
          People2.Post( { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.deepEqual( person,
  
  { name: 'Tony_prepareBodyPost',
    id: person.id }
  
            );        
  
            test.done();
          });
        });
      },
  
      'Post() APIg validate': function( test ){
        zap( function(){
  
          g.People.Post( { name: 'Tony', surname: "1234567890123456789012345", age: 37 }, function( err, person ){
             
            test.deepEqual( err.errors,  [ { field: 'surname', message: 'Field is too long: surname' } ] );
            test.equal( err.message, "Unprocessable Entity");
            test.equal( err.httpError, 422);
            test.done();
          });
        });
      },
  
      'Post() REST checkPermissionsPost': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            checkPermissionsPost: function( params, body, options, cb ){
              if( body.name === 'TONY' ) cb( null, false );
              else cb( null, true );
            },  
          });
   
          var req = makeReq( { body: { name: 'TONY', surname: 'Mobily' } } );
          (People2.online.Post(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 403 );
            test.done();
          }))
  
        });
      },
  
      'Post() APIg cleanup': function( test ){
        zap( function(){
  
          g.People.Post( { name: "Tony", extra: "Won't be saved" }, function( err, person ){
            test.ifError( err );
            test.deepEqual( person, { name: 'Tony', id: person.id } ); 
            test.done();
          });
        });
      },
  
      'Post() APIh extrapolateDoc': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
  
            extrapolateDoc: function( params, body, options, fullDoc, done ){
  
              var doc = {};
              for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
              doc.name = doc.name + '_extrapolateDoc';
  
              done( null, doc );
            },
  
          });
  
   
          // Set the basic stores
          People2.Post( { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.deepEqual( person,
  
  { name: 'Tony_extrapolateDoc',
    id: person.id }
            );        
  
            test.done();
          });
        });
      },
  
      'Post() APIg castDoc': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
  
            extrapolateDoc: function( params, body, options, fullDoc, done ){
  
              var doc = {};
              for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
              doc.age = doc.age.toString();
              done( null, doc );
            }
          });
          People2.Post( { name: 'Tony', age: 37 }, function( err, person ){
            test.ifError( err );
  
            test.equal( person.age, 37 );
            test.done();
          });
        })
      },
  
      'Post() REST echoAfterPost': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            echoAfterPost: false
          });
   
          var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
          (People2.online.Post(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 201 );
            test.equal( data, '' );
          }))
  
          test.done();
        });
      },
  
      'Post() REST prepareBeforeSend': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
   
            prepareBeforeSend: function( doc, done ){
  
              var sendDoc = {};
              for( var k in doc ) sendDoc[ k ] = doc[ k ];
              sendDoc.beforeSend = '_prepareBeforeSend';
  
              done( null, sendDoc );
            }
          });
  
          var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
          (People2.online.Post(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'json' );
            test.equal( status, 201 );
            test.equal( headers.Location, 'http://www.example.com/' + data.id );
            test.equal( data.name, 'Tony' );
            test.equal( data.surname, 'Mobily' );
            test.equal( data.beforeSend, '_prepareBeforeSend' );
            test.ok( data.id );
  
            test.done();
          }));
  
        });
      },
  
      'Post() APIh prepareBeforeSend': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
  
            prepareBeforeSend: function( doc, done ){
  
              var sendDoc = {};
              for( var k in doc ) sendDoc[ k ] = doc[ k ];
              sendDoc.beforeSend = '_prepareBeforeSend';
  
              done( null, sendDoc );
            },
  
          });
   
          // Set the basic stores
          People2.Post( { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.deepEqual( person,
  
  { name: 'Tony',
    id: person.id,
    beforeSend: '_prepareBeforeSend' }
  
            );
  
            test.done();
          });
        });
      },
  
      'Post() REST afterPost': function( test ){
        zap( function(){
  
  
          var afterPost = false;
          var People2 = declare( g.People, {
   
            afterPost: function( params, body, options, doc, fullDoc, done){
              afterPost = true;
              done( null );
            },
          });
  
          var req = makeReq( { body: { name: 'TONy', surname: 'Mobily' } } );
          (People2.online.Post(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( afterPost, true );
            test.equal( status, 201 );
  
            test.done();
  
          }));
  
        }); 
  
      },
  
      'Post() APIh afterPost': function( test ){
        zap( function(){
  
          var afterPost = false;
          var People2 = declare( g.People, {
  
            afterPost: function( params, body, options, doc, fullDoc, done){
              afterPost = true;
              done( null );
            },
  
          });
  
   
          // Set the basic stores
          People2.Post( { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.equal( afterPost, true );
  
            test.done();
          });
        });
      },
  
  
  
      // *********************************
      // ********** PUT ******************
      // *********************************
  
      /* PUT:
         * REST  handlePut
         * REST  checkParamIds
         * APIh  prepareBodyPut
         * APIg  validate
         NEW:
         * REST  checkPermissionsPutNew
         * APIg  cleanup
         * APIh  extrapolateDoc
         * APIg  castDoc
         * REST  echoAfterPutNew
         * REST/APIh prepareBeforeSend (if echoAfterPutNew)
         * REST/APIh afterPutNew
         EXISTING:
         * APIh  (+)extrapolateDoc
         * APIg  (+)castDoc
         * REST  checkPermissionsPutExisting
         * APIg  cleanup
         * APIh  extrapolateDoc
         * APIg  castDoc
         * REST  echoAfterPutExisting
         * REST/APIh prepareBeforeSend (if echoAfterPutExisting)
         * REST/APIh afterPutExisting
      */
  
  
  
      'Put() API Working test (new, existing)': function( test ){
        zap( function(){
  
          // New
          var p = { id: 1234, name: 'Tony', surname: "Mobily", age: 37 };
          g.People.Put( null, p, function( err, person ){
            test.ifError( err );
  
            g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
              test.ifError( err );
              test.deepEqual( data[ 0 ], person );
  
              // Existing
              var p = { name: 'Tony', surname: "Mobily", age: 38 };
              g.People.Put( person.id, p, function( err, person ){
                test.ifError( err );
  
                g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
                  test.ifError( err );
                  test.deepEqual( data[ 0 ], person );
                  test.equal( data[ 0 ].age, 38 );
  
                  test.done();
                });
              });
            });
          });
  
        });
      },
  
      'Put() API Working test (overwrite)': function( test ){
        zap( function(){
  
          // New
          var p = { id: 1234, name: 'Tony', surname: "Mobily", age: 37 };
          g.People.Put( null, p, { overwrite: true }, function( err, person ){
  
            test.equal( err.message, "Precondition Failed" );
            test.equal( err.httpError, 412 );
  
            g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, function( err ){
  
              var p = { id: 1234, name: 'Tony', surname: "Mobily", age: 37 };
              g.People.Put( null, p, { overwrite: true }, function( err, person ){
                test.ifError( err );
  
                g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
                  test.ifError( err );
                  test.deepEqual( data[ 0 ], person );
  
  
                  zap( function() {
  
                    // Existing
                    var p = { name: 'Tony', surname: "Mobily", age: 38 };
                    g.People.Put( person.id, p, { overwrite: false }, function( err, person ){
                      test.ifError( err );
  
                      g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
                        test.ifError( err );
                        test.deepEqual( data[ 0 ], person );
                        test.equal( data[ 0 ].age, 38 );
  
                        var p = { name: 'Tony', surname: "Mobily", age: 38 };
                        g.People.Put( person.id, p, { overwrite: false }, function( err, person ){
  
                          test.equal( err.message, "Precondition Failed" );
                          test.equal( err.httpError, 412 );
  
                          test.done();
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
  
  
      'Put() REST Working test (new, existing)': function( test ){
        zap( function(){
  
          var req = makeReq( { params: { id: 1234 }, body: { id: 1235, name: 'Tony', surname: 'Mobily' } } );
          (g.People.online.Put(g.People))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
            var res = this;
  
            test.equal( type, 'json' );
            test.equal( status, 201 );
            test.equal( headers.Location, 'http://www.example.com/1234' );
            test.equal( data.name, 'Tony' );
            test.equal( data.surname, 'Mobily' );
            test.ok( data.id );
  
            var req = makeReq( { params: { id: 1234 }, body: { name: 'Tony2', surname: 'Mobily2' } } );
            (g.People.online.Put(g.People))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );
              var res = this;
  
              test.equal( type, 'json' );
              test.equal( status, 200 );
              test.equal( headers.Location, 'http://www.example.com/1234' );
              test.equal( data.name, 'Tony2' );
              test.equal( data.surname, 'Mobily2' );
              test.ok( data.id );
  
              test.done();
            }));
          }));
        });
      },
  
  
      'Put() REST Working test (overwrite)': function( test ){
        zap( function(){
  
          var req = makeReq( { headers: { 'if-match': '*' }, params: { id: 1234 }, body: { id: 1235, name: 'Tony', surname: 'Mobily' } } );
          (g.People.online.Put(g.People))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 412 );
            test.equal( data.message, 'Precondition Failed' );
  
                  
            g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, function( err ){
  
              var req = makeReq( { headers: { 'if-match': '*' }, params: { id: 1234 }, body: { id: 1235, name: 'Tony', surname: 'Mobily' } } );
              (g.People.online.Put(g.People))(req, new RES( function( err, type, headers, status, data ){
                test.ifError( err );
                var res = this;
  
                test.equal( type, 'json' );
                test.equal( status, 200 );
                test.equal( headers.Location, 'http://www.example.com/1234' );
                test.equal( data.name, 'Tony' );
                test.equal( data.surname, 'Mobily' );
                test.ok( data.id );
  
                zap( function(){
  
                  var req = makeReq( { headers: { 'if-none-match': '*' }, params: { id: 1234 }, body: { id: 1235, name: 'Tony', surname: 'Mobily' } } );
                  (g.People.online.Put(g.People))(req, new RES( function( err, type, headers, status, data ){
                    test.ifError( err );
                    var res = this;
  
                    test.equal( type, 'json' );
                    test.equal( status, 201 );
                    test.equal( headers.Location, 'http://www.example.com/1234' );
                    test.equal( data.name, 'Tony' );
                    test.equal( data.surname, 'Mobily' );
                    test.ok( data.id );
  
  
                    var req = makeReq( { headers: { 'if-none-match': '*' }, params: { id: 1234 }, body: { id: 1235, name: 'Tony', surname: 'Mobily' } } );
                    (g.People.online.Put(g.People))(req, new RES( function( err, type, headers, status, data ){
                      test.ifError( err );
                      var res = this;
  
                      test.equal( type, 'bytes' );
                      test.equal( status, 412 );
                      test.equal( data.message, 'Precondition Failed' );
  
                      test.done();
                    }));
                  }));
                });
              }));
            });
          }));
        });
      },
  
      'Put() REST handlePut': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            handlePut: false,
          });
   
          var req = makeReq( { params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
          (People2.online.Put(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
            test.equal( type, 'bytes' );
            test.equal( status, 501 );
  
            test.done();
          }));
        });
      },
  
      'Put() REST checkParamIds': function( test ){
        zap( function(){
  
          var req = makeReq( { params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
          (g.WsPeople.online.Post(g.WsPeople))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 400 );
            test.deepEqual( data,
  
  { message: 'Bad Request',
    errors: 
     [ { field: 'workspaceId',
         message: 'Field required in the URL: workspaceId' } ] }
                  );
   
            test.done();
          }));
        });
      },
  
  
      'Put() APIh prepareBodyPut': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            prepareBodyPut: function( body, done ){
              body.name = body.name.toUpperCase();
              done( null, body );
            }
          });
   
          var req = makeReq( { params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
          (People2.online.Put(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'json' );
            test.equal( status, 201 );
            test.equal( headers.Location, 'http://www.example.com/1234' );
            test.equal( data.name, 'TONY' );
            test.equal( data.surname, 'Mobily' );
            test.ok( data.id );
  
            test.done();
          }))
        });
      },
  
      'Put() APIg validate': function( test ){
        zap( function(){
  
          var p = { name: 'Tony', surname: "1234567890123456789012", age: 37 };
          g.People.Put( 1234, p, function( err, person ){
  
            test.deepEqual( err.errors, [ { field: 'surname', message: 'Field is too long: surname' } ] );
            test.equal( err.message, 'Unprocessable Entity' );
            test.equal( err.httpError, 422 );
  
            test.done();
          });
        });
      },
  
   
      'Put() NEW REST checkPermissionsPutNew': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            checkPermissionsPutNew: function( params, body, options, cb ){
              if( body.name === 'TONY' ) cb( null, false );
              else cb( null, true );
            },  
          });
   
          var req = makeReq( { params: { id: 1234 }, body: { name: 'TONY', surname: 'Mobily' } } );
          (People2.online.Put(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 403 );
            test.done();
   
          }));
        });
      },
  
      'Put() NEW APIg cleanup': function( test ){
        zap( function(){
  
          var p = { id: 1234, name: "Tony", age: 37, extra: "Won't be saved" }; 
          g.People.Put( null, p, function( err, person ){
            test.ifError( err );
            test.deepEqual( person, { name: 'Tony', age: 37, id: person.id } ); 
            test.done();
          });
        });
      },
  
      'Put() NEW APIh extrapolateDoc': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
    
            extrapolateDoc: function( params, body, options, fullDoc, done ){
    
              var doc = {};
              for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
              doc.name = doc.name + '_extrapolateDoc';
              doc.age = doc.age.toString();
              done( null, doc );
            }
          });
    
    
          People2.Put( 1234, { name: "Tony", age: 37 }, function( err, person ){
            test.ifError( err );
    
            test.equal( person.name, 'Tony_extrapolateDoc' );
            test.equal( person.age, 37 );
   
            test.done();
          });
        });
      },
  
      'Put() NEW APIg castDoc': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
    
            extrapolateDoc: function( params, body, options, fullDoc, done ){
    
              var doc = {};
              for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
              doc.age = doc.age.toString();
              done( null, doc );
            }
          });
    
    
          People2.Put( 1234, { name: "Tony", age: 37 }, function( err, person ){
            test.ifError( err );
            test.equal( person.age, 37 );
  
            test.done();
          });
        });
  
      },
  
      'Put() NEW REST echoAfterPutNew': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            echoAfterPost: false
          });
   
          var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
          (People2.online.Post(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 201 );
            test.equal( data, '' );
  
            test.done();
          }))
        });
      },
  
      'Put() NEW APIh prepareBeforeSend': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
  
            prepareBeforeSend: function( doc, done ){
  
              var sendDoc = {};
              for( var k in doc ) sendDoc[ k ] = doc[ k ];
              sendDoc.beforeSend = '_prepareBeforeSend';
  
              done( null, sendDoc );
            },
  
          });
   
          // Set the basic stores
          People2.Put( 1234, { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.deepEqual( person,
  
  { name: 'Tony',
    id: person.id,
    beforeSend: '_prepareBeforeSend' }
  
            );
            test.done();
          });
  
        });
      },
  
      'Put() NEW REST prepareBeforeSend (if echoAfterPutNew)': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
   
            prepareBeforeSend: function( doc, done ){
  
              var sendDoc = {};
              for( var k in doc ) sendDoc[ k ] = doc[ k ];
              sendDoc.beforeSend = '_prepareBeforeSend';
  
              done( null, sendDoc );
            }
          });
  
          var req = makeReq( { params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
          (People2.online.Put(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'json' );
            test.equal( status, 201 );
            test.equal( headers.Location, 'http://www.example.com/' + data.id );
            test.equal( data.name, 'Tony' );
            test.equal( data.surname, 'Mobily' );
            test.equal( data.beforeSend, '_prepareBeforeSend' );
            test.ok( data.id );
  
            test.done();
          }));
        });
      },
  
      'Put() NEW APIh afterPutNew': function( test ){
        zap( function(){
  
          var flag = false;
          var People2 = declare( g.People, {
  
            afterPutNew: function( params, body, options, doc, fullDoc, overwrite, done){
              flag = true;
              done( null );
            },
  
          });
   
          // Set the basic stores
          People2.Put( 1234, { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.equal( flag, true );
  
            test.done();
          });
        });
      },
  
      'Put() NEW REST afterPutNew': function( test ){
        zap( function(){
  
          var flag = false;
          var People2 = declare( g.People, {
   
            afterPutNew: function( params, body, options, doc, fullDoc, overwrite, done ){
              flag = true;
              done( null );
            },
          });
  
          var req = makeReq( { params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
          (People2.online.Put(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( flag, true );
            test.equal( status, 201 );
  
            test.done();
          }));
        });
      },
  
  
      'Put() EXISTING APIh (+)extrapolateDoc': function( test ){
        zap( function(){
  
          // This test is done within (+)castDoc        
          test.done();
        });
      },
  
      'Put() EXISTING APIg (+)castDoc': function( test ){
        zap( function(){
  
          var ageAtFirstExtrapolateDocs;
          var People2 = declare( g.People, {
    
            extrapolateDoc: function( params, body, options, fullDoc, done ){
              if( ! People2.onlyOnce ){
                People2.onlyOnce = true;
                ageAtFirstExtrapolateDocs = fullDoc.age;
              }
              done( null, fullDoc );
            }
          });
    
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: '37' }, { multi: true }, function( err ){
            test.ifError( err );
  
            People2.Put( 1234, { name: 'Tony', age: 38, extra: 'EXTRA' }, function( err, person ){
              test.ifError( err );
              test.equal( typeof ageAtFirstExtrapolateDocs, 'string' );
              test.equal( typeof person.age, 'number' );
  
              test.done();
            });
          });
        });
      },
  
      'Put() EXISTING REST checkPermissionsPutExisting': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            var People2 = declare( g.People, {
              checkPermissionsPutExisting: function(  params, body, options, doc, fullDoc, cb ){
                if( body.name === 'TONY' ) cb( null, false );
                else cb( null, true );
              },  
            });
   
            var req = makeReq( { params: { id: 1234 }, body: { name: 'TONY' } } );
            (People2.online.Put(People2))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );
  
              var res = this;
  
              test.equal( type, 'bytes' );
              test.equal( status, 403 );
              test.done();
            }));
          })
    
        });
      },
  
      'Put() EXISTING APIg cleanup': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            g.People.Put( 1234, { name: 'Tony', age: 38, extra: 'EXTRA' }, function( err, person ){
              test.ifError( err );
              test.equal( typeof( person.extra ), 'undefined' );
  
              test.done();
            });
          });
        });
      },
  
      'Put() EXISTING APIh extrapolateDoc': function( test ){
        zap( function(){
  
          var firstTimeRun = true;
          var People2 = declare( g.People, {
    
            extrapolateDoc: function( params, body, options, fullDoc, done ){
  
              var doc = {};
              for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
  
              if( People2.firstTimeRun ){
                People2.firstTimeRun = false;
              } else {
                doc.age ++;
              }
              done( null, doc );
            }
          });
    
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            People2.Put( 1234, { name: 'Tony', age: 37 }, function( err, person ){
              test.ifError( err );
  
              test.equal( person.age, 38 );
  
              test.done();
            });
          });
        });
      },
  
      'Put() EXISTING APIg castDoc': function( test ){
        zap( function(){
  
          // Not really testable
  
          test.done();
        });
      },
  
      'Put() EXISTING REST echoAfterPutExisting': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            var People2 = declare( g.People, {
              echoAfterPost: false
            });
  
            var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
            (People2.online.Post(People2))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );
  
              var res = this;
  
              test.equal( type, 'bytes' );
              test.equal( status, 201 );
              test.equal( data, '' );
  
              test.done();
            }))
          })
        });
  
      },
  
      'Put() EXISTING APIh prepareBeforeSend': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
            var People2 = declare( g.People, {
  
              prepareBeforeSend: function( doc, done ){
  
                var sendDoc = {};
                for( var k in doc ) sendDoc[ k ] = doc[ k ];
                sendDoc.beforeSend = '_prepareBeforeSend';
  
                done( null, sendDoc );
              },
  
            });
   
            // Set the basic stores
            People2.Put( 1234, { name: "Tony" }, function( err, person ){
              test.ifError( err );
              test.deepEqual( person,
  
  { name: 'Tony',
    id: person.id,
    beforeSend: '_prepareBeforeSend' }
  
              );
   
              test.done();
            });
          });
        });
      },
  
      'Put() EXISTING REST prepareBeforeSend  (if echoAfterPutExisting)': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
            var People2 = declare( g.People, {
   
              prepareBeforeSend: function( doc, done ){
  
                var sendDoc = {};
                for( var k in doc ) sendDoc[ k ] = doc[ k ];
                sendDoc.beforeSend = '_prepareBeforeSend';
  
                done( null, sendDoc );
              }
            });
  
            var req = makeReq( { params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
            (People2.online.Put(People2))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );
  
              var res = this;
  
              test.equal( type, 'json' );
              test.equal( status, 200 );
              test.equal( headers.Location, 'http://www.example.com/1234' );
              test.equal( data.name, 'Tony' );
              test.equal( data.surname, 'Mobily' );
              test.equal( data.beforeSend, '_prepareBeforeSend' );
              test.ok( data.id );
  
              test.done();
            }));
          });
        });
      },
  
      'Put() EXISTING APIh afterPutExisting': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            var flag = false;
            var People2 = declare( g.People, {
   
              afterPutExisting: function( params, body, options, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){
                flag = true;
                cb( null );
              },
            });
  
            // Set the basic stores
            People2.Put( 1234, { name: "Tony" }, function( err, person ){
              test.ifError( err );
              test.equal( flag, true );
              test.done();
            });
          });
        });
      },
  
      'Put() EXISTING REST afterPutExisting': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            var flag = false;
            var People2 = declare( g.People, {
   
              afterPutExisting: function( params, body, options, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){
                flag = true;
                cb( null );
              },
            });
  
            var req = makeReq( { params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
            (People2.online.Put(People2))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );
  
              var res = this;
  
              test.equal( flag, true );
              test.equal( status, 200 );
  
              test.done();
            }))
          });
  
        });
      },
  
  
  
      // *********************************
      // ********** GET ******************
      // *********************************
      /*
         * REST  handleGet
         * REST  checkParamIds
         * APIh  extrapolateDoc
         * APIg  castDoc
         * REST  checkPermissionsGet
         * APIh prepareBeforeSend
         * APIh afterGet
      */
  
      'Get() API Working test': function( test ){
  
        zap( function(){
  
          var p = { id: 1234, name: 'Tony', surname: 'Mobily', age: 37 };
          g.dbPeople.insert( p, function( err ){
            test.ifError( err );
  
            g.People.Get( 1234, function( err, person ){
              test.ifError( err );
  
              test.deepEqual( p, person );
  
              test.done();
            });
          });
  
        });
      },
  
      'Get() REST Working test': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', surname: 'Mobily', age: '37' }, function( err ){
            test.ifError( err );
  
            var req = makeReq( { params: { id: 1234 } } );
            (g.People.online.Get(g.People))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );
              var res = this;
  
              test.equal( type, 'json' );
              test.equal( status, 200 );
              test.equal( data.name, 'Tony' );
              test.equal( data.surname, 'Mobily' );
              test.equal( data.age, 37 );
              test.equal( typeof( data.age ), 'number' );
              test.ok( data.id );
  
              test.done();
            }));
          });
   
        });
  
      },
  
  
      'Get() REST handleGet': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            handleGet: false,
          });
  
          var req = makeReq( { params: { id: 1234 } } );
          (People2.online.Get(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
            test.equal( type, 'bytes' );
            test.equal( status, 501 );
  
            test.done();
          }));
  
        });
  
      },
  
      'Get() REST checkParamIds': function( test ){
        zap( function(){
  
          var req = makeReq( { params: { id: 1234 } } );
          (g.WsPeople.online.Get(g.WsPeople))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 400 );
            test.deepEqual( data,
  
  { message: 'Bad Request',
    errors: 
     [ { field: 'workspaceId',
         message: 'Field required in the URL: workspaceId' } ] }
                  );
   
            test.done();
          }));
        });
  
      },
  
      'Get() APIh extrapolateDoc': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
    
            extrapolateDoc: function( params, body, options, fullDoc, done ){
  
              var doc = {};
              for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
              doc.age ++;
              done( null, doc );
            }
          });
    
          var p = { id: 1234, name: 'Tony', age: 37 };
          g.dbPeople.insert( p, function( err ){
            test.ifError( err );
  
            People2.Get( 1234, function( err, person ){
              test.ifError( err );
              test.equal( person.age, 38 );
  
              test.done();
            });
          });
        });
  
      },
  
      'Get() APIg castDoc': function( test ){
        zap( function(){
  
          // Already happened with inserting age: '37' in 'Get() REST Working test'
          test.done();
        });
  
      },
  
      'Get() REST checkPermissionsGet': function( test ){
        zap( function(){
  
           g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            var People2 = declare( g.People, {
              checkPermissionsGet: function(  params, body, options, doc, fullDoc, cb ){
                if( params.id === 1234 ) cb( null, false );
                else cb( null, true );
              },  
            });
   
            var req = makeReq( { params: { id: 1234 } } );
            (People2.online.Get(People2))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );
  
              var res = this;
  
              test.equal( type, 'bytes' );
              test.equal( status, 403 );
          
              test.done();
            }));
          });
        });
  
      },
  
      'Get() APIh prepareBeforeSend': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
            var People2 = declare( g.People, {
  
              prepareBeforeSend: function( doc, done ){
  
                var sendDoc = {};
                for( var k in doc ) sendDoc[ k ] = doc[ k ];
                sendDoc.beforeSend = '_prepareBeforeSend';
  
                done( null, sendDoc );
              },
  
            });
   
            // Set the basic stores
            People2.Get( 1234, { name: "Tony" }, function( err, person ){
              test.ifError( err );
              test.deepEqual( person,
  
  { name: 'Tony',
    id: person.id,
    age: 37,
    beforeSend: '_prepareBeforeSend' }
  
              );
              test.done();
            });
          });
        });
  
      },
  
      'Get() APIh afterGet': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            var flag = false;
            var People2 = declare( g.People, {
   
              afterPutExisting: function( params, body, options, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){
                flag = true;
                cb( null );
              },
            });
  
            // Set the basic stores
            People2.Put( 1234, { name: "Tony" }, function( err, person ){
              test.ifError( err );
              test.equal( flag, true );
  
              test.done();
            });
          });
        });
  
      },
  
      'Get() API toughness test: invalid ID': function( test ){
        g.People.Get( { a: 10 }, function( err, personGet ){
          test.deepEqual( err.errors, [ { field: 'id', message: 'Error during casting' } ] );
          test.deepEqual( err.message, 'Bad Request' );
          test.deepEqual( err.httpError, 400 );
          test.done();
        });
      },
  
      'Get() API toughness test: getting non-existing data': function( test ){
  
        zap( function(){
  
          g.People.Get( 1234, function( err, personGet ){
            test.ok( err !== null );
  
            test.equal( personGet, null );
            test.equal( err.httpError, 404 );
  
            test.done();
          });
        });
      },
  
      'Get() API toughness test: fetching data that fails schema': function( test ){
  
        zap( function(){
          g.People.Post( { name: 'Tony', surname: "Mobily", age: 37 }, function( err, person ){
            test.ifError( err );
  
            g.dbPeople.update( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id  } ] } }, { surname: '1234567890123456789012' }, { deleteUnsetFields: false }, function( err, total ){
              test.ifError( err );
              test.ok( total === 1 );
  
              g.People.Get( person.id, function( err, personGet ){
                test.deepEqual( err.errors, [ { field: 'surname', message: 'Field is too long: surname' } ] );
                test.deepEqual( err.message, 'Bad Request' );
                test.deepEqual( err.httpError, 400 );
   
                test.done();
              });
            });
          });
        });
      },
  
      'Get() API toughness test: fetching data with non-unique ids': function( test ){
  
        zap( function( err ){
  
          // Set the basic stores
          g.PeopleWrongId = declare( g.JRS, {
  
            schema: new Schema({
              name:     { type: 'string' },
              surname:  { type: 'string', max: 20, filterType: { type: 'eq'  } },
              age:      { type: 'number', max: 99 },
            }),
  
            storeName: 'people',
            paramIds: [ 'surname' ],
          });
  
          g.People.Post( { name: 'Tony', surname: "Mobily", age: 37 }, function( err, person1 ){
            test.ifError( err );
            g.People.Post( { name: 'Chiara', surname: "Mobily", age: 24 }, function( err, person2 ){
              test.ifError( err );
  
              g.PeopleWrongId.Get( 'Mobily', function( err, person3 ){
                test.ok( typeof( err ) === 'object' );
                test.ok( err.message === 'execAllDbFetch fetched more than 1 record' );
                test.done();
              });
            });
  
          });
        });  
  
      },
  
  
  
      // *********************************
      // ********** DELETE ***************
      // *********************************
      /*
         * REST  handleDelete
         * REST  checkParamIds
         * APIh  extrapolateDoc
         * APIg  castDoc
         * REST  checkPermissionsDelete
         * APIh afterDelete
      */
  
      'Delete() API Working test': function( test ){
  
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', surname: 'Mobily', age: 37 }, { multi: true, returnRecord: true }, function( err, person ){
            test.ifError( err );
  
            g.People.Get( person.id, function( err, personGet ){
              test.ifError( err );
              test.deepEqual( person, personGet );
  
              g.People.Delete( person.id, function( err ){
                test.ifError( err );
                
                g.dbPeople.select( { }, function( err, docs ){
                  test.ifError( err );
  
                  test.equals( docs.length, 0 );
  
                  test.done();
                });
              });
            });
          });
        });
      },
  
      'Delete() REST Working test': function( test ){
        zap( function(){
  
          var p = { id: 1234, name: 'Tony', surname: 'Mobily', age: 37 };
          g.dbPeople.insert( p, { multi: true, returnRecord: true }, function( err, person ){
            test.ifError( err );
  
            var req = makeReq( { params: { id: 1234 } } );
            (g.People.online.Delete(g.People))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );
  
              var res = this;
  
              test.equal( type, 'bytes' );
              test.equal( status, 204 );
  
              g.dbPeople.select( { }, function( err, docs ){
                test.ifError( err );
  
                test.equals( docs.length, 0 );
  
                test.done();
              });
            }));
          });
        });
      },
  
  
      'Delete() REST handleDelete': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            handleDelete: false,
          });
  
          var req = makeReq( { params: { id: 1234 } } );
          (People2.online.Delete(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
            test.equal( type, 'bytes' );
            test.equal( status, 501 );
  
            test.done();
          }));
        });
  
      },
  
      'Delete() REST checkParamIds': function( test ){
        zap( function(){
  
          var req = makeReq( { params: { id: 1234 } } );
          (g.WsPeople.online.Get(g.WsPeople))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 400 );
            test.deepEqual( data,
  
  { message: 'Bad Request',
    errors: 
     [ { field: 'workspaceId',
         message: 'Field required in the URL: workspaceId' } ] }
                  );
            test.done();
          }));
   
        });
  
      },
  
      'Delete() APIh extrapolateDoc': function( test ){
        zap( function(){
  
          var extrapolatedSurname = {};
          var ageBeforeCast;
  
          var p = { id: 1234, name: 'Tony', surname: 'Mobily', age: '37' };
          g.dbPeople.insert( p, { multi: true, returnRecord: true }, function( err, person ){
            test.ifError( err );
  
            var People2 = declare( g.People, {
    
              extrapolateDoc: function( params, body, options, fullDoc, done ){
  
                var doc = {};
                for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
                doc.surname += '_extrapolated';
  
                ageBeforeCast = doc.age;
                extrapolatedSurname = doc.surname;
  
                done( null, doc );
              }
            });
    
            People2.Delete( 1234, function( err, person ){
              test.ifError( err );
              test.equal( extrapolatedSurname, 'Mobily_extrapolated' );
              test.equal( typeof ageBeforeCast, 'string' );
              test.equal( typeof person.age, 'number' );
  
              test.done();
            });
          });
        });
  
      },
  
      'Delete() APIg castDoc': function( test ){
        zap( function(){
  
          // Already tested in 'Delete() APIh extrapolateDoc' with age: '37'
          test.done();
        });
  
      },
  
      'Delete() REST checkPermissionsDelete': function( test ){
        zap( function(){
  
           g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            var People2 = declare( g.People, {
              checkPermissionsDelete: function(  params, body, options, doc, fullDoc, cb ){
                if( params.id === 1234 ) cb( null, false );
                else cb( null, true );
              },  
            });
   
            var req = makeReq( { params: { id: 1234 } } );
            (People2.online.Delete(People2))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );
  
              var res = this;
  
              test.equal( type, 'bytes' );
              test.equal( status, 403 );
          
              test.done();
            }));
          });
   
        });
  
      },
  
      'Delete() APIh afterDelete': function( test ){
        zap( function(){
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            var flag = false;
            var People2 = declare( g.People, {
  
              afterDelete: function( params, body, options, doc, fullDoc, cb ){
                flag = true;
                cb( null );
              },
            });
  
            // Set the basic stores
            People2.Delete( 1234, { name: "Tony" }, function( err, person ){
              test.ifError( err );
              test.equal( flag, true );
  
              test.done();
            });
          });
        });
  
      },
  
      'API Delete() toughness test: deleting non-existing data': function( test ){
  
        zap( function(){
  
          g.People.Delete( 1234, function( err, total ){
            test.ok( err !== null );
            test.equal( err.httpError, 404 );
  
            test.done();
          });
  
        });
      },
  
      // *********************************
      // ********** GETQUERY ***************
      // *********************************
      /*
         * REST handleGetQuery
         * REST checkParamIds
         * REST checkPermissionsGetQuery
         * APIg validate
         * APIg extrapolateDoc
         * APIg castDoc
         * APIg prepareBeforeSend
      */
  
      'GetQuery() API Working test -- filters': function( test ){
        zap( function(){
  
          var l = [];
          async.series([
            function( done ){ g.People.Post( { name: 'Tony', surname: "Mobily", age: 37 },    function( err, r ){ l.push( r); done() }) },
            function( done ){ g.People.Post( { name: 'Chiara', surname: "Mobily", age: 24 },  function( err, r ){ l.push( r); done() }) },
            function( done ){ g.People.Post( { name: 'Daniela', surname: "Mobily", age: 64 }, function( err, r ){ l.push( r); done() }) },
            function( done ){ g.People.Post( { name: 'Sara', surname: "Fabbietti", age: 14 }, function( err, r ){             done() }) },
          ], function( err ){
            test.ifError( err );
            
            g.People.GetQuery( { filters: { nameSt: 'Mo' } }, function( err, docs ){
              test.ifError( err );
              compareCollections( test, l, docs );
  
              g.People.GetQuery( { filters: { ageGt: 20 } }, function( err, docs ){
                test.ifError( err );
                compareCollections( test, l, docs );
  
                test.done();
              });
            });
          });
        });
      },
  
      'GetQuery() API Working test -- sorting': function( test ){
        zap( function(){
  
          async.series([
            function( done ){ g.People.Put( 1234, { id: 1234, name: 'Tony', surname: "Mobily", age: 37 },    function( err, r ){ done( err ) }) },
            function( done ){ g.People.Put( 1235, { id: 1235, name: 'Chiara', surname: "Mobily", age: 24 },  function( err, r ){ done( err ) }) },
            function( done ){ g.People.Put( 1236, { id: 1236, name: 'Daniela', surname: "Mobily", age: 64 }, function( err, r ){ done( err ) }) },
            function( done ){ g.People.Put( 1237, { id: 1237, name: 'Sara', surname: "Fabbietti", age: 14 }, function( err, r ){ done( err ) }) },
          ], function( err ){
            test.ifError( err );
            
            g.People.GetQuery( { sort: { age: 1 } }, function( err, docs ){
              test.ifError( err );
  
              test.deepEqual( docs,
  
  [ { id: 1237, name: 'Sara', surname: 'Fabbietti', age: 14 },
    { id: 1235, name: 'Chiara', surname: 'Mobily', age: 24 },
    { id: 1234, name: 'Tony', surname: 'Mobily', age: 37 },
    { id: 1236, name: 'Daniela', surname: 'Mobily', age: 64 } ]
  
              );
  
              test.done();
            });
          });
        });
      },
  
      'GetQuery() API Working test -- limit': function( test ){
        zap( function(){
  
          async.series([
            function( done ){ g.People.Put( 1234, { name: 'Tony', surname: "Mobily", age: 37 },    function( err, r ){ done( err ) }) },
            function( done ){ g.People.Put( 1235, { name: 'Chiara', surname: "Mobily", age: 24 },  function( err, r ){ done( err ) }) },
            function( done ){ g.People.Put( 1236, { name: 'Daniela', surname: "Mobily", age: 64 }, function( err, r ){ done( err ) }) },
            function( done ){ g.People.Put( 1237, { name: 'Sara', surname: "Fabbietti", age: 14 }, function( err, r ){ done( err ) }) },
          ], function( err ){
            test.ifError( err );
            
            g.People.GetQuery( { sort: { age: 1 }, ranges: { limit: 1 } }, function( err, docs ){
              test.ifError( err );
  
              test.deepEqual( docs,
  
  [ { id: 1237, name: 'Sara', surname: 'Fabbietti', age: 14 } ]
  
              );
  
              test.done();
            });
          });
        });
      },
  
      'GetQuery() REST handleGetQuery': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            handleGetQuery: false,
          });
  
          var req = makeReq( { params: { id: 1234 } } );
          (People2.online.GetQuery(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
            test.equal( type, 'bytes' );
            test.equal( status, 501 );
  
            test.done();
          }));
        });
  
      },
  
      'GetQuery() REST checkParamIds': function( test ){
        zap( function(){
  
          var req = makeReq( { params: { id: 1234 } } );
          (g.WsPeople.online.Get(g.WsPeople))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 400 );
            test.deepEqual( data,
  
  { message: 'Bad Request',
    errors: 
     [ { field: 'workspaceId',
         message: 'Field required in the URL: workspaceId' } ] }
  
            );
            test.done();
          }));
   
        });
  
      },
  
      'GetQuery() REST checkPermissionsGetQuery': function( test ){
        zap( function(){
  
          var People2 = declare( g.People, {
            checkPermissionsGetQuery: function(  params, body, options, cb ){
              if( options.filters.name === 'Tony' ) cb( null, false );
              else cb( null, true );
            },  
          });
   
          var req = makeReq( { url: "http://www.example.org/people?name=Tony&surname=Mobily" } );
          (People2.online.GetQuery(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 403 );
  
            test.done();
          }));
        });
  
      },
  
      'GetQuery() APIg validate': function( test ){
        zap( function(){
  
          var req = makeReq( { url: "http://www.example.org/people?name=Tony&surname=1234567890123456789012" } );
          (g.People.online.GetQuery(g.People))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 400 );
            test.deepEqual( data,
  
  { message: 'Bad Request',
    errors: [ { field: 'surname', message: 'Field is too long: surname' } ] }
            );
  
            test.done();
          }));
        });
  
      },
  
      'GetQuery() APIg extrapolateDoc': function( test ){
        zap( function(){
  
          var l = [];
  
          var People2 = declare( g.People, {
  
            extrapolateDoc: function( params, body, options, fullDoc, done ){
  
              var doc = {};
              for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
              doc.surname += '_extrapolated';
  
              if( doc.name == 'Tony' ) ageBeforeCast = doc.age;
  
              done( null, doc );
            }
          });
  
   
          // NOTE! The age is '37', and then `r` is corrected to 37 for comparison.
          async.series([
            function( done ){ g.dbPeople.insert( { name: 'Tony', surname: "Mobily", age: '37' }, { returnRecord: true }, function( err, r ){ r.surname += "_extrapolated"; r.age = 37; l.push( r ); done() }) },
            function( done ){ g.dbPeople.insert( { name: 'Chiara', surname: "Mobily", age: 24 }, { returnRecord: true }, function( err, r ){ r.surname += "_extrapolated"; l.push( r ); done() }) },
            function( done ){ g.dbPeople.insert( { name: 'Daniela', surname: "Mobily", age: 64 }, { returnRecord: true }, function( err, r ){ r.surname += "_extrapolated"; l.push( r ); done() }) },
            function( done ){ g.dbPeople.insert( { name: 'Sara', surname: "Fabbietti", age: 14 }, { returnRecord: true }, function( err, r ){             done() }) },
          ], function( err ){
            test.ifError( err );
  
             People2.GetQuery( { filters: { nameSt: 'Mo' } }, function( err, docs ){
              test.ifError( err );
  
              compareCollections( test, l, docs );
   
              test.done();
            });
          });
        });
  
      },
  
      'GetQuery() APIg castDoc': function( test ){
        zap( function(){
  
          // Already tested in 'GetQuery() APIg extrapolateDoc'
          test.done();
        });
  
      },
  
      'GetQuery() APIg prepareBeforeSend': function( test ){
        zap( function(){
  
          var l = [];
  
          var People2 = declare( g.People, {
            prepareBeforeSend: function( doc, done ){
              var sendDoc = {};
              for( var k in doc ) sendDoc[ k ] = doc[ k ];
              sendDoc.prepared = 10;
  
               done( null, sendDoc );
            },
          });
   
          async.series([
            function( done ){ g.dbPeople.insert( { name: 'Tony', surname: "Mobily", age: 37 }, { returnRecord: true }, function( err, r ){ r.prepared = 10; l.push( r); done() }) },
            function( done ){ g.dbPeople.insert( { name: 'Chiara', surname: "Mobily", age: 24 }, { returnRecord: true }, function( err, r ){ r.prepared = 10; l.push( r); done() }) },
            function( done ){ g.dbPeople.insert( { name: 'Daniela', surname: "Mobily", age: 64 }, { returnRecord: true }, function( err, r ){ r.prepared = 10; l.push( r); done() }) },
            function( done ){ g.dbPeople.insert( { name: 'Sara', surname: "Fabbietti", age: 14 }, { returnRecord: true }, function( err, r ){             done() }) },
          ], function( err ){
            test.ifError( err );
  
             People2.GetQuery( { filters: { nameSt: 'Mo' } }, function( err, docs ){
              test.ifError( err );
  
              compareCollections( test, l, docs );
   
              test.done();
            });
          });
        });
  
      },
  
  
      'testing _queryMakeSelector': function( test ){
  
         var people = new g.People();
  
         var selector = people._queryMakeSelector( { name: 'Tony', surname: 'Mobily' } );
         test.deepEqual( selector,
  
  { conditions: 
     { and: 
        [ { field: 'name', type: 'eq', value: 'Tony' },
          { field: 'surname', type: 'eq', value: 'Mobily' } ] },
    ranges: undefined,
    sort: undefined }
         );
        
         var selector = people._queryMakeSelector( { nameSt: 'Mob', ageGt: 20 } );
  
         test.deepEqual( selector,
  
  { conditions: 
     { and: 
        [ { field: 'surname', type: 'startsWith', value: 'Mob' },
          { field: 'age', type: 'gt', value: 20 } ] },
    ranges: undefined,
    sort: undefined }
  
         );
  
         var selector = people._queryMakeSelector( { name: 'Tony' }, { name: -1, surname: 1 }  );
  
         test.deepEqual( selector, 
  
  { conditions: { and: [ { field: 'name', type: 'eq', value: 'Tony' } ] },
    ranges: undefined,
    sort: { name: -1, surname: 1 } }
  
         );
  
         var selector = people._queryMakeSelector( { name: 'Tony' }, { name: -1, surname: 1 }, { from: 0, to: 10, limit: 5}  );
  
         test.deepEqual( selector, 
  
  { conditions: { and: [ { field: 'name', type: 'eq', value: 'Tony' } ] },
    ranges: { from: 0, to: 10, limit: 5 },
    sort: { name: -1, surname: 1 } }
  
         );
  
         test.done();
      },
  
      'testing _initOptionsFromReq for Put()': function( test ){
  
         var people = new g.People();
         
         var req = {};
         req.headers = {};
  
         req.headers[ 'if-match' ] = '*';
         var options = people._initOptionsFromReq( 'Put', req );
         test.deepEqual( options, { overwrite: true } );
  
         req.headers[ 'if-none-match' ] = '*';
         var options = people._initOptionsFromReq( 'Put', req );
         test.deepEqual( options, { overwrite: false } );
  
         req.headers = {};
         var options = people._initOptionsFromReq( 'Put', req );
         test.deepEqual( options, { } );
  
         test.done();
      }, 
  
      'testing _initOptionsFromReq for GetQuery() -- just parameters': function( test ){
  
         var people = new g.People();
         
         // Basic initialisation
         var req = {};
         req.headers = {};
  
         req.url = "http://www.example.org/people?name=Tony&surname=Mobily";
  
         var options = people._initOptionsFromReq( 'GetQuery', req );
         test.deepEqual( options, 
  
  { sort: {},
    ranges: null,
    filters: { name: 'Tony', surname: 'Mobily' } }
  
         );
         
         test.done();
      }, 
  
  
      'testing _initOptionsFromReq for GetQuery() -- sortBy': function( test ){
  
         var people = new g.People();
         
         // Basic initialisation
         var req = {};
         req.headers = {};
  
         req.url = "http://www.example.org/people?name=Tony&surname=Mobily&sortBy=+name,-surname";
  
         var options = people._initOptionsFromReq( 'GetQuery', req );
         test.deepEqual( options, 
  
  { sort: { name: 1, surname: -1 },
    ranges: null,
    filters: { name: 'Tony', surname: 'Mobily' } }
  
         );
  
         req.url = "http://www.example.org/people?name=Tony&surname=Mobily&sortBy=+name,wrongNoSign,-surname";
  
         var options = people._initOptionsFromReq( 'GetQuery', req );
         test.deepEqual( options, 
  
  { sort: { name: 1, surname: -1 },
    ranges: null,
    filters: { name: 'Tony', surname: 'Mobily' } }
         );
  
         
         test.done();
      }, 
  
      'testing _initOptionsFromReq for GetQuery() -- ranges': function( test ){
  
         var people = new g.People();
         
         // Basic initialisation
         var req = {};
         req.headers = {};
  
         req.headers.range = "items=0-10";
         req.url = "http://www.example.org/people?name=Tony";
  
         var options = people._initOptionsFromReq( 'GetQuery', req );
         test.deepEqual( options, 
  
  { sort: {},
    ranges: { from: 0, to: 10, limit: 11 },
    filters: { name: 'Tony' } }
  
         );
  
  
         req.headers.range = "items= 0-10";
         req.url = "http://www.example.org/people?name=Tony";
  
         var options = people._initOptionsFromReq( 'GetQuery', req );
         test.deepEqual( options, 
  
  { sort: {},
    ranges: null,
    filters: { name: 'Tony' } }
  
         );
  
         test.done();
      }, 
  
  
      'testing chainErrors': function( test ){
        zap( function(){
    
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
            test.ifError( err );
  
            var WsPeople2 = declare( g.WsPeople, {
              chainErrors: 'all'
            });
  
            var WsPeople3 = declare( g.People, {
              chainErrors: 'nonhttp',
  
              extrapolateDoc: function( params, body, options, fullDoc, cb ){
                cb( new Error("Some other error") );
              },
   
            
            });
  
            // This chains all of them
            var req = makeReq( { params: { id: 1234 } } );
            (WsPeople2.online.Get(WsPeople2))(req,
              new RES( function( err, type, headers, status, data ){
                test.equal("I should not be here", "" );
                test.done();
              }),
              function( err ){
                test.deepEqual( err.errors,
  
  [ { field: 'workspaceId',
         message: 'Field required in the URL: workspaceId' } ]
  
              );
              test.equal( err.message, 'Bad Request' );
              test.equal( err.httpError, 400 );
  
  
  
  
  
                // This chains all of them
                var req = makeReq( { params: { id: 1234 } } );
                (WsPeople3.online.Get(WsPeople3))(req,
                  new RES( function( err, type, headers, status, data ){

                    test.equal("I should not be here", "" );
  
                    //console.log("A");
                    //console.log( err, type, headers, status, data );
                    test.done();
  
                  }),
                  function( err ){
  
                    test.equal( err.message, "Some other error" );
                    test.done();
  
                  }
                );
  
              }
            );
  
          });
        }); 
      },

      'Testing that logError gets fired': function( test ){
        zap( function(){

          var errorLogged = false;  
          var People2 = declare( g.People, {

            handleDelete: false,

            logError: function(){
              errorLogged = true;
            },

          });
  
          var req = makeReq( { params: { id: 1234 } } );
          (People2.online.Delete(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
            test.equal( type, 'bytes' );
            test.equal( status, 501 );
            process.nextTick( function(){
              test.equal( errorLogged, true ); 
              test.done();
            });
          }));
        });
  
      },
 
      'Testing that formatError is used': function( test ){
        zap( function(){

          var errorLogged = false;  
          var People2 = declare( g.People, {

            handleDelete: false,

            formatErrorResponse: function( error ){

              if( error.errors ){
                return { message: error.message, errors: error.errors, custom: true }
              } else {
                return { message: error.message, custom: true }
              }
            },

          });
  
          var req = makeReq( { params: { id: 1234 } } );
          (People2.online.Delete(People2))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
            test.equal( type, 'bytes' );
            test.equal( status, 501 );
            test.equal( data.custom, true );
            test.done();
          }));
        });
  
      },
 

  }

  tests.finish = finish;

  return tests;
}



