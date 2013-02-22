var 
  dummy
;

var declare = exports.declare = function(superCtor, protoMixin) {

  // Kidnap the `constructor` element from protoMixin, as this
  // it mustn't get copied over into the prototype
  var constructor = protoMixin.constructor;
  delete protoMixin.constructor;

  // The function that will work as the effective constructor. This
  // will be returned
  var ctor = function(){

    // Call the superclass constructor automatically
    if( typeof( superCtor.prototype.constructor === 'function' ) ){
       superCtor.prototype.constructor.apply( this, arguments );
    }

    // Call its own constuctor (kidnapped a second ago)
    if( typeof( constructor ) === 'function' ){
      constructor.apply( this, arguments );
    }
  };

  // The superclass can be either an empty one, or the one passed
  // as a parameter
  superCtor = superCtor === null ? function(){} : superCtor;

  // Create the new class' prototype. It's a new object, which happen to
  // have its own prototype (__proto__) set as the superclass' and the
  // `constructor` attribute set as ctor (the one we are about to return)
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });

  // Implement inherited() so that classes can run this.inherited(arguments)
  // This will only work for sub-classes created using declare() as they are
  // the ones with the _inheritMap in their prototype
  protoMixin.inherited = function(args){
    var name, fn;

    // Look for the name in the _inheritMap
    name = this._inheritMap[ args.callee ];
    if( name ){
      fn = superCtor.prototype[name];
      if( fn ){
        return fn.apply( this, args );
      } else {
        throw( new Error("Method " + name + "() not inherited!") );
      }
    }
  }

  // Copy every element in protoMixin into the prototype.
  ctor.prototype._inheritMap = {}
  for( var k in protoMixin ){
    ctor.prototype[ k ] = protoMixin[ k ];
    ctor.prototype._inheritMap[ protoMixin[ k ] ] = k;
  }

  return ctor;
};
exports = module.exports = declare;

// Some testing...

/* 

var First = declare( null, {
  one: function(p){ 
    console.log("one in First");
    console.log(p); 
    return 1000; 
  },
  two: function(p){ 
    console.log("two in First");
    console.log(p);
    return 1001; 
  },
  constructor: function(a){ 
    this.a = a; 
    console.log("Constructor of First called");
  },
})

var Second = declare( First, {
  two: function( p ){
    console.log("two in Second"); 
    console.log( p );
    a = this.inherited(arguments);
    console.log("Inherited function returned: " + a );
  },
  constructor: function(a){ 
    console.log("Constructor of Second called, and this.a is...");
    console.log( this.a );
  },
})

console.log("Creating first...");
first = new First(10);
console.log("Creating second...");
second = new Second( 20 );

console.log( "first.a:")
console.log( first.a );
console.log( "second.a:")
console.log( second.a );

console.log( "first.one(1):")
first.one(1);
console.log( "first.two(2):")
first.two(2);

console.log( "second.one(3):")
second.one(3);
console.log( "second.two(4):")
second.two(4);
*/
