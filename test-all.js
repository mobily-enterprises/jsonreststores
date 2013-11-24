
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



var peopleData = exports.peopleData = [
  { name: 'Chiara',    surname: 'Mobily',     age: 22 },
  { name: 'Tony',      surname: 'Mobily',     age: 37 },
  { name: 'Sara',      surname: 'Connor',     age: 14 },
  { name: 'Daniela',   surname: 'Mobily',     age: 64 },
];


function i( v ){
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
        console.log( err );
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
          id:       { type: 'id' },
          name:     { type: 'string' },
          surname:  { type: 'string', max: 20 },
          age:      { type: 'number', max: 99 },
        }),

        storeName: 'people',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        paramIds: [ 'id' ],
      });
     

      // Clear people table
      g.people = new g.DbDriver( 'people', {  name: true, surname: true, age: false }  ); 
      g.people.delete( { }, { multi: true }, function( err ){
        if( err ){
          throw( new Error("Could not empty database, giving up") );
          process.exit();
        } else {
          console.log("Projection hash:");
          console.log(g.people.projectionHash );
          g.people.insert( { name:'a', surname:'b', age:10  }, function( err ){
            test.done();
          });
        }
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


  tests = {

    startup: startup,

    'testing Post()': function( test ){

      g.People.Post( { name: 'Tony', surname: "Mobily", age: 37 }, function( err ){
        test.ifError( err );
        test.done();

         

      });
    }

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

