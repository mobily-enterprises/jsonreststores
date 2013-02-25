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
  // the ones with super which maps the super-method
  protoMixin.inherited = function(args){
    var name, fn;

      fn = args.callee.super;
      if( fn ){
        return fn.apply( this, args );
      } else {
        throw( new Error("Method " + name + "() not inherited!") );
      }
  }

  // Copy every element in protoMixin into the prototype.
  for( var k in protoMixin ){
    ctor.prototype[ k ] = protoMixin[ k ];
    if( typeof(  ctor.prototype[ k ] ) === 'function' && superCtor.prototype[k] ){
      ctor.prototype[ k ].super = superCtor.prototype[k];
    }
  }

  return ctor;
};
exports = module.exports = declare;

// Some testing...

/*

var A = declare( null, {
  methodOne: function(p){ 
    console.log("methodOne in A");
    console.log(p); 
    return 1000; 
  },
  methodTwo: function(p){ 
    console.log("methodTwo in A");
    console.log(p);
    return 1001; 
  },
  methodThree: function(p){ 
    console.log("methodThree in A");
    console.log(p);
    return 1002; 
  },
  constructor: function(a){ 
    this.a = a; 
    console.log("Constructor of A called");
  },
})

var B = declare( A, {
  methodOne: function( p ){
    console.log("methodOne in B"); 
    console.log( p );
    a = this.inherited(arguments);
    console.log("Inherited function returned: " + a );
  },
  constructor: function(a){ 
    console.log("Constructor of B called, and this.a is...");
    console.log( this.a );
  },
})

var C = declare( B, {
  methodTwo: function( p ){
    console.log("methodTwo in C"); 
    console.log( p );
    a = this.inherited(arguments);
    console.log("Inherited function returned: " + a );
  },
  constructor: function(a){ 
    console.log("Constructor of C called, and this.a is...");
    console.log( this.a );
  },
})




console.log("Creating a...");
a = new A(10);
console.log("Creating b...");
b = new B( 20 );
console.log("Creating c...");
c = new C( 30 );

console.log( "a.a:")
console.log( a.a );
console.log( "b.a:")
console.log( b.a );
console.log( "c.a:")
console.log( c.a );

console.log( "a.methodOne(1):")
a.methodOne(1);
console.log( "a.methodTwo(2):")
a.methodTwo(2);

console.log( "b.methodOne(3):")
b.methodOne(3);
console.log( "b.methodTwo(4):")
b.methodTwo(4);

console.log( "c.methodOne(5):")
c.methodOne(5);
console.log( "c.methodTwo(6):")
c.methodTwo(6);

*/
