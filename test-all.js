
/*
Copyright (C) 2013 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
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

  var startup = function( test ){
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
              test.done();
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


  tests = {

    startup: startup,

    /* POST TODO:
       * REST  handlePost
       * REST  checkParamIds
       * APIH  prepareBodyPost
       * APIG  validate
       * REST  checkPermissionsPost
       * APIG  cleanup
       * APIH  extrapolateDoc
       * APIG  castDoc
       * REST  echoAfterPost
       * REST/APIH prepareBeforeSend
       * REST/APIH afterPost
    */

    'API Post(): testing (general)': function( test ){

      
      g.dbPeople.delete( { }, { multi: true }, function( err ){
        test.ifError( err );

        // STRAIGHT

        g.People.Post( { name: 'Tony', surname: "Mobily", age: 37 }, function( err, person ){
          test.ifError( err );

          g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
            test.ifError( err );
            test.deepEqual( data[ 0 ], person );

          
            // APIG validate

            g.People.Post( { name: 'Tony', surname: "1234567890123456789012345", age: 37 }, function( err, person ){
           
              test.deepEqual( err.errors,  [ { field: 'surname', message: 'Field is too long: surname' } ] );
              test.equal( err.message, "Unprocessable Entity");
              test.equal( err.httpError, 422);


              // APIG cleanUp

              // Set the basic stores
              g.WsPeople.Post( { workspaceId: 1234, name: "Tony", extra: "Won't be saved" }, function( err, person ){
                test.ifError( err );
                test.deepEqual( person, { workspaceId: 1234, name: 'Tony', id: person.id } ); 

                // APIG castDoc
                
                // This will artificially change the age to its string equivalent. There is no other way
                // to test this, unless I want to hack the DB layer underneath
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
              });
            });
          });
        });

      });
    },

    'API Post(): testing (hooks)': function( test ){

     /*
       * APIH prepareBodyPost
       * APIH extrapolateDoc
       * REST/APIH prepareBeforeSend
       * REST/APIH afterPost
      */

      var afterPost = false;
      var People2 = declare( g.People, {

        prepareBodyPost: function( body, done ){
          body.name = body.name + "_prepareBodyPost";
          done( null, body );
        },

        extrapolateDoc: function( params, body, options, fullDoc, done ){

          var doc = {};
          for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
          doc.name = doc.name + '_extrapolateDoc';

          done( null, doc );
        },

        prepareBeforeSend: function( doc, done ){

          var sendDoc = {};
          for( var k in doc ) sendDoc[ k ] = doc[ k ];
          sendDoc.beforeSend = '_prepareBeforeSend';

          done( null, sendDoc );
        },

        afterPost: function( params, body, options, doc, fullDoc, done){
          afterPost = true;
          done( null );
        },

      });

 
      // Set the basic stores
      People2.Post( { name: "Tony" }, function( err, person ){
        test.ifError( err );
        test.deepEqual( person,

{ name: 'Tony_prepareBodyPost_extrapolateDoc',
  id: person.id,
  beforeSend: '_prepareBeforeSend' }

        );        

        test.equal( afterPost, true );

        test.done();
      }); 


    },


    'REST Post(): testing': function( test ){

/*
       * REST echoAfterPost
       * REST/APIH prepareBeforeSend
       * REST/APIH afterPost
*/

      // STRAIGHT

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


        // * REST handlePost

        var People2 = declare( g.People, {
          handlePost: false,
        });
 
        var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
        (g.WsPeople.online.Post(g.WsPeople))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );

          var res = this;

          test.equal( type, 'bytes' );
          test.equal( status, 400 );

       
          // * REST checkParamIds

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
          
            // * REST checkPermissionsPost

            var People2 = declare( g.People, {
              
              handlePost: false,
            });
 
            var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
            (g.WsPeople.online.Post(g.WsPeople))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );

              var res = this;

              test.equal( type, 'bytes' );
              test.equal( status, 400 );

 


              test.done();
            }));

          }));
        }));

      }));

    },

    'REST Post(): hooks': function( test ){

      // TODO: permissions
      // TODO: echoAfterPost
      // TODO: prepareBeforeSend
      // TODO: afterPost
   


      var WsPeople2 = declare( g.WsPeople, {

        prepareBodyPost: function( body, done ){
          body.name = body.name.toUpperCase();
          body.surname = body.surname + body.extra;
          done( null, body );
        },

        extrapolateDoc: function( params, body, options, fullDoc, done ){

          var doc = {};
          for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
          doc.name = doc.name + '_EXTRAPOLATED';

          done( null, doc );
        },

        prepareBeforeSend: function( doc, done ){

          var sendDoc = {};
          for( var k in doc ) sendDoc[ k ] = doc[ k ];
          sendDoc.beforeSend = 'PREPARED_BEFORE_SEND';

          done( null, sendDoc );
        },

        afterPost: function( params, body, options, doc, fullDoc, done){
          this._res.afterPostRun = true;
          done( null );
        },

      });

      var req = makeReq( { params: { workspaceId: 121212 }, body: { name: 'Tony', surname: 'Mobily', extra: '_PREPARED' } } );

      (WsPeople2.online.Post(WsPeople2))(req, new RES( function( err, type, headers, status, data ){
        test.ifError( err );

        var res = this;

        test.equal( type, 'json' );
        test.equal( status, 201 );
        test.equal( headers.Location, 'http://www.example.com/' + data.id );
        test.equal( data.name, 'TONY_EXTRAPOLATED' );
        test.equal( data.surname, 'Mobily_PREPARED' );
        test.equal( data.workspaceId, 121212 );
        test.equal( data.beforeSend, 'PREPARED_BEFORE_SEND' );
        test.equal( data.extra, undefined );
        test.equal( res.afterPostRun, true );
        test.ok( data.id );

        test.done();
      }));


    },







    'API Put(): testing': function( test ){

      g.dbPeople.delete( { }, { multi: true }, function( err ){
        var p = { name: 'Tony', surname: "Mobily", age: 37 };
        Schema.makeId( p, function( err, id ){
          test.ifError( err );
          p.id = id;
          g.People.Put( null, p, function( err, person ){
            test.ifError( err );

            g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
              test.ifError( err );
              test.deepEqual( data[ 0 ], person );
              test.done();
            });
          });
        });

      });
    },

    'API Put(): overwriting': function( test ){

      g.dbPeople.delete( { }, { multi: true }, function( err ){
        var p = { name: 'Tony', surname: "Mobily", age: 37 };
        Schema.makeId( p, function( err, id ){
          test.ifError( err );
          p.id = id;
          g.People.Put( null, p, function( err, person ){
            test.ifError( err );

            g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
              test.ifError( err );
              test.deepEqual( data[ 0 ], person );

              person.surname = "Changed";
              delete person.name;
              g.People.Put( null, person, function( err, person2 ){
                test.ifError( err );
                test.ok( person2, { age: 37, id: 5517971, surname: 'Changed' } ); 

                test.done();
              });
            });
          });
        });

      });
    },


    'API Get(): testing': function( test ){

      g.dbPeople.delete( { }, { multi: true }, function( err ){
        test.ifError( err );
        g.People.Post( { name: 'Tony', surname: "Mobily", age: 37 }, function( err, person ){
          test.ifError( err );

          g.People.Get( person.id, function( err, personGet ){
            test.ifError( err );
            test.deepEqual( person, personGet );
            test.done();
          });
        });

      });
    },

    'API Get(): invalid ID': function( test ){
      g.People.Get( { a: 10 }, function( err, personGet ){
        test.deepEqual( err.errors, [ { field: 'id', message: 'Error during casting' } ] );
        test.deepEqual( err.message, 'Bad Request' );
        test.deepEqual( err.httpError, 400 );
        test.done();
      });
    },

    'API Get(): getting non-existing data': function( test ){

      g.dbPeople.delete( { }, { multi: true }, function( err ){

        Schema.makeId( {}, function( err, id ){
          test.ifError( err );
 
          g.People.Get( id, function( err, personGet ){
            test.ok( err !== null );

            test.equal( personGet, null );
            test.equal( err.httpError, 404 );

            test.done();
          });
        });

      });
    },

    'API Get(): fetching data that fails schema': function( test ){

      g.dbPeople.delete( { }, { multi: true }, function( err ){
        test.ifError( err );
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


    'API Delete(): testing': function( test ){

      g.dbPeople.delete( { }, { multi: true }, function( err ){
        test.ifError( err );
        g.People.Post( { name: 'Tony', surname: "Mobily", age: 37 }, function( err, person ){
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

    'API Delete(): deleting non-existing data': function( test ){

      g.dbPeople.delete( { }, { multi: true }, function( err ){

        Schema.makeId( {}, function( err, id ){
          test.ifError( err );
 
          g.People.Delete( id, function( err, total ){
            test.ok( err !== null );
            test.equal( err.httpError, 404 );

            test.done();
          });
        });

      });
    },



    'fetching data with non-unique ids': function( test ){

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
     
      g.dbPeople.delete( { }, { multi: true }, function( err ){
        test.ifError( err );

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

    
    'API GetQuery: testing': function( test ){

      g.dbPeople.delete( { }, { multi: true }, function( err ){
        test.ifError( err );

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


/* 
        console.log("Callback called!");
        console.log( err );
        console.log( type );
        console.log( headers );
        console.log( status );
        console.log( data );
*/





    /*
      TODO:
        * Write tests same as API ones, but using the Online calls
        * Test _all_ hooks with all tests
    */

  }

  tests.finish = finish;

  return tests;
}



/*

 OLD LAME TESTS:



// The basic Store classes
var Store = require('jsonreststores');
var MongoDriverMixin = require('jsonreststores/MongoDriverMixin.js');

// The basic Schema classes
var Schema = require('simpleschema');
var MongoSchemaMixin = require('simpleschema/MongoSchemaMixin.js');

var declare = require( 'simpledeclare' );

// The mongoWrapper class, that will make it easier to get a "db" object
mw = require('mongowrapper');



// The new MongoStore and MongoSchema classes, which use multiple
// inheritance to create MongoDB-specific classes
var MongoStore = declare( [ Store, MongoDriverMixin ] );
var MongoSchema = declare( [ Schema, MongoSchemaMixin ] );


// it( 'run some tests', function( next ){


  mw.connect('mongodb://localhost/testing', {}, function( err ){
    if (err) throw err;

      var Users = declare( MongoStore, {

        schema: new MongoSchema({
          _id    : { type: 'id' },
          name   : { type: 'string', notEmpty: true, trim: 20, searchable: true, searchPartial: true, sortable: true  },
          surname: { type: 'string', notEmpty: true, trim: 20, searchable: true, sortable: true  },
          age    : { type: 'number', notEmpty: true, searchable: true, sortable: true  },
          fromAge: { type: 'number', notEmpty: false, filterType: { type: 'range', field: 'age', direction: 'from' } },
          toAge  : { type: 'number', notEmpty: false, filterType: { type: 'range', field: 'age', direction: 'to' } },
        }),

        storeName: 'users',

        db: mw.db,

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        paramIds: [ '_id' ],

        prepareBeforeSend: function( doc, cb ){
          doc.name = doc.name.toUpperCase();
          cb( null, doc );
        },
      });


      Users.MassDelete( { allowZapping: true }, function( err ) {



        Users.Post( { name: 'Tony', surname: 'Mobily', age: '37' }, function( err ){
          if (err) throw err;
          Users.Post( { name: 'Chiara', surname: 'Mobily', age: '22' }, function( err ) {
            if (err) throw err;
            Users.Post( { name: 'Sara', surname: 'Fabbietti', age: '14' }, function( err ){
              if (err) throw err;
          
     
                Users.GetQuery( { remove: false, cursor: true, searchPartial: { surname: true } , filters: { surname: 'Mob' } }, function( err, cursor1 ){ 
                  console.log("CURSOR DATA:");
                  console.log("GetQuery returned error: ");
                  console.log( err );
                  cursor1.next( function( err, data ){
                    console.log("DATA IS:");
                    console.log( err );
                    console.log( data );

                    Users.GetQuery( { cursor: true, searchPartial: { surname: true } , filters: { surname: 'Fab' } }, function( err, cursor2 ){
                      console.log("NOW I am here:");
                      console.log( err );                   

                      cursor2.next( function( err, data ){
                        console.log("TESTING");
                        console.log("DATA IN CURSOR 2 IS:");
                        console.log( err );
                        console.log( data );


                        cursor1.next( function( err, data ){
                          console.log("DATA IS AGAIN:");
                          console.log( err );
                          console.log( data );


                          cursor1.next( function( err, data ){
                            console.log("DATA IS AGAINi THIRD:");
                            console.log( err );
                            console.log( data );

                            Users.MassUpdate( { name: "CAUGHT" }, { searchPartial: { surname: true } , filters: { surname: 'Mob' } } , function( err, num ){
                              console.log("DONE");
                            } );

                          });

                        });

                      });

                    });
                  });
                });
                
 
                //Users.MassDelete( { searchPartial: { surname: true } , filters: { surname: 'Mob' } }, function( err ){
                // Users.MassDelete( { searchPartial: { 'surname': true }, filters: { surname: 'Mob', fromAge: 13, toAge: 25 } }, function( err ){
                //  if (err) throw err;
                //});

 

            });



          });
        });
      });

//  });

});







*/

