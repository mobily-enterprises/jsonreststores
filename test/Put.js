
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






