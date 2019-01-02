export default class ASTCompiler {

    public static EXTRA_NAME      = "l";
    public static SCOPE_NAME      = "s";
    public static filterSupported = false;
    private varCount: number;
    private opened: number;
    private type;
    private lastVariable: string;
    private readonly functionCount: string[];
    private readonly variablePath: string[];
    private variables: string[];
    private declarations: string[];
    private body: string[];

    constructor ( private expression: string ) {

        this.varCount = 0;
        this.opened   = 0;

        this.type = {
            "function"         : "FUNCTION",
            "bracketExpression": "BRACKETEXPRESSION",
            "identifier"       : "IDENTIFIER",
            "literal"          : "LITERAL",
            "filter"           : "FILTER",
            "expression"       : "EXPRESSION",
            "functionCall"     : "FUNCTIONCALL"
        };

        this.functionCount = [];
        this.variablePath  = [];
        this.lastVariable  = "";
        this.variables     = [];
        this.declarations  = [];
        this.body          = [];

    }

    get currentScope () {
        return this.lastVariable || ASTCompiler.SCOPE_NAME;
    }

    static if ( scope, property, varName ) {
        return ASTCompiler.isIn( scope, property ) + ` { ${varName} = ${scope}.${property} } ` + ASTCompiler.elseIn( ASTCompiler.EXTRA_NAME, property ) + ` { ${varName} = ${ASTCompiler.EXTRA_NAME}.${property} }`;
    }

    static notNull ( varName ) {
        return `if( ${varName} !== undefined && ${varName} !== null )`;
    }

    static isIn ( object, property ) {
        return `if( ${object} && "${property}" in ${object} )`;
    }

    static elseIn ( object, property ) {
        return "else " + ASTCompiler.isIn( object, property );
    }

    static has ( object, name ) {
        return `if( ${object} && typeof ${object}.${name} != "undefined" )`
    }

    static elseHas ( object, name ) {
        return "else " + ASTCompiler.has( object, name );
    }

    static isKeyword ( value: string ) {
        return value == "true" || value == "false";
    }

    buildIdentifier ( item ) {

        if ( ASTCompiler.isKeyword( item.expression ) )
            return item.expression;

        const v   = this.createVar(),
              exp = item.expression,
              p   = this.variablePath.length ? this.variablePath[ this.variablePath.length - 1 ] : ASTCompiler.SCOPE_NAME;

        this.declarations.push( ASTCompiler.if( p, exp, v ) );
        this.variables.push( v );
        this.variablePath.push( v );
        return v;
    }

    createVar ( add?: number ) {

        const v = "v" + ( this.varCount + ( add || 0 ) );
        if ( add === undefined )
            this.varCount++;

        return v;
    }

    resetPath ( item ) {

        switch ( item.type ) {
            case "IDENTIFIER":
            case "STRING":
            case "NUMBER":
                return false;
        }
        this.lastVariable        = "";
        this.variablePath.length = 0;
        return true;
    }

    isFilterExpression ( item, index, lexer ) {

        let _index = index,
            name   = "",
            opened = 0,
            _item  = item;

        if ( !lexer[ index + 1 ] )
            return false;

        function openClose () {

            if ( _item ) {

                if ( _item.value === "(" && lexer[ _index + 1 ] && lexer[ _index + 1 ].value !== ")" )
                    open();

                else if ( _item.value === ")" && lexer[ _index - 1 ] && lexer[ _index - 1 ].value !== "(" )
                    close();
            }
        }

        function open () {
            opened++;
        }

        function close () {
            opened--;
        }

        function checkValue () {

            switch ( _item.key ) {
                case "IDENTIFIER":
                case "DOT":
                case "NUMBER":
                case "STRING":
                    return false;
            }
            return true;
        }

        if ( checkValue() )
            return false;


        while ( _item && _item.value !== "|" ) {

            openClose();
            if ( checkValue() )
                return false;

            name += _item.value;
            _index++;
            _item = lexer[ _index ];
        }
        _index++;
        _item = lexer[ _index ];

        if ( _item && _item.value !== "|" ) {

            const declaration = {
                type      : this.type.filter,
                index     : _index,
                length    : _index - index,
                arguments : [],
                expression: _item.value
            };

            _index++;
            _item = lexer[ _index ];
            declaration.arguments.push( compile( this, name )[ 0 ] );

            while ( _item && _item.value !== ")" ) {

                if ( _item.value === ":" ) {

                    declaration.arguments.push( { type: "COMMA", expression: "," } );
                    _index++;
                } else {

                    const part = this.compilePart( _item, _index, lexer );
                    if ( part ) {

                        declaration.arguments.push( part );
                        _index += part.length;

                    } else {
                        _index++;
                    }
                }
                _item = lexer[ _index ];
            }

            declaration.length = _index - index;
            return declaration;
        }
    }

    isBraceExpression ( item, index, lexer ) {

        let _index = index,
            name   = "",
            open   = false,
            _item  = item;
        if ( !lexer[ index + 1 ] )
            return false;

        function checkValue () {

            switch ( _item.key ) {
                case "IDENTIFIER":
                case "L_BRACKET":
                case "NUMBER":
                case "STRING":
                    return false;
            }
            return true;
        }

        if ( _item.value !== "[" )
            return;

        while ( _item && _item.value !== "]" ) {

            if ( checkValue() )
                return false;

            if ( _item.value === "[" )
                open = true;

            if ( open )
                name += _item.value;

            _index++;
            _item = lexer[ _index ];
        }

        if ( open ) {

            return {
                type      : this.type.bracketExpression,
                index     : _index + 1,
                length    : ( _index - index ) + 1,
                expression: name.substr( 1 )
            };
        }
    }

    isFunctionExpression ( item, index, lexer ) {

        let _index = index,
            name   = "",
            _item  = item;

        if ( !lexer[ index + 1 ] )
            return false;

        function checkValue () {

            switch ( _item.key ) {
                case "IDENTIFIER":
                case "DOT":
                    return true;
            }
            return false;
        }

        if ( !checkValue() )
            return false;

        while ( _item && _item.value !== "(" ) {

            if ( !checkValue() )
                return false;

            name += _item.value;
            _index++;
            _item = lexer[ _index ];
        }

        if ( _index === lexer.length )
            return false;

        if ( name[ 0 ] === "." )
            name = name.substr( 1 );


        let openClose = () => {

            if ( _item ) {

                if ( _item.value === "(" && lexer[ _index + 1 ] && lexer[ _index + 1 ].value !== ")" )
                    this.opened++;
                else if ( _item.value === ")" && lexer[ _index - 1 ] && lexer[ _index - 1 ].value !== "(" )
                    this.opened--;
            }
        };

        if ( index !== _index ) {

            openClose();

            const declaration = {
                type      : this.type.function,
                index     : _index,
                length    : _index - index,
                arguments : [],
                expression: name
            };

            if ( lexer[ _index + 1 ] && lexer[ _index + 1 ].value === ")" ) {

                declaration.index += 2;
                declaration.length += 2;
                return declaration;
            }
            _index++;
            _item = lexer[ _index ];
            while ( _item && ( this.opened > 1 ? true : _item.value !== ")" ) ) {

                const part = this.compilePart( _item, _index, lexer );

                if ( part ) {
                    if ( part.expression !== "," && part.expression !== ")" )
                        declaration.arguments.push( part );


                    _index += part.length;

                } else {
                    _index++;
                }

                openClose();
                _item = lexer[ _index ];
            }

            _index++;
            declaration.length = _index - index;
            return declaration;
        }
        return false;
    }

    isExpression ( item, index, lexer ) {

        let _index = index, name = "", _item = item;
        if ( !lexer[ index + 1 ] )
            return false;

        function checkValue () {

            switch ( _item.key ) {
                case "IDENTIFIER":
                case "DOT":
                    return true;
            }
            return false;
        }

        while ( _item && checkValue() ) {

            name += _item.value;
            _index++;
            _item = lexer[ _index ];
        }

        if ( lexer[ index + 1 ] && lexer[ index + 1 ].key == "DOT" ) {

            let functionExpression = this.isFunctionExpression( lexer[ index + 1 ], index + 1, lexer );

            if ( functionExpression ) {

                functionExpression.index      = _index;
                functionExpression.length += _index - index + 1;
                functionExpression.expression = _item.value + "." + functionExpression.expression;
                return functionExpression;
            }
        }

        if ( index !== _index ) {

            return {
                type      : this.type.expression,
                index     : _index,
                length    : _index - index,
                expression: name
            };
        }
    }

    compilePart ( item, index, lexer ) {

        const isFunctionExpression = this.isFunctionExpression( item, index, lexer );
        if ( isFunctionExpression )
            return isFunctionExpression;


        const isFilterExpression = this.isFilterExpression( item, index, lexer );
        if ( isFilterExpression )
            return isFilterExpression;


        const isBraceExpression = this.isBraceExpression( item, index, lexer );
        if ( isBraceExpression )
            return isBraceExpression;


        const isExpression = this.isExpression( item, index, lexer );
        if ( isExpression )
            return isExpression;


        return {
            type      : item.key,
            length    : 1,
            index     : index,
            expression: item.value
        };

    }

    compile () {

        const scope = compile( this, this.expression );

        let iterateArguments = item => {

            let arg = "", newVar;

            switch ( item.type ) {

                case this.type.literal:

                    arg       = this.createVar();
                    const exp = item.expression;
                    this.declarations.push( `${arg} = ${exp}` );
                    this.variables.push( arg );
                    this.variablePath.push( arg );
                    this.variablePath.push( arg );
                    this.functionCount.push( arg );
                    this.lastVariable = arg;
                    break;

                case this.type.function:

                    let currentVarName,
                        expressions = item.expression.split( "." ),
                        args        = [],
                        call        = expressions.pop();

                    if ( this.functionCount.length ) {

                        currentVarName = this.functionCount[ this.functionCount.length - 1 ];
                        this.body.pop();
                    } else {

                        currentVarName = this.currentScope;
                        this.functionCount.push( currentVarName );
                    }

                    forEach( item.arguments, function ( argument ) {
                        args.push( iterateArguments( argument ) );
                    } );

                    let type = this.type.expression;

                    if ( expressions.length ) {

                        const expression = expressions.join( "." );

                        if ( expression.match( /(^")|^\d+$/ ) )
                            type = this.type.literal;

                        currentVarName = iterateArguments( {
                            type      : type,
                            expression: expression
                        } );
                    }
                    newVar = this.createVar();
                    this.functionCount.push( newVar );
                    this.declarations.push(
                        ASTCompiler.has( currentVarName, call ) + ` { ${newVar} = ${currentVarName}.${call}(${args.join( "," )})} ` + ASTCompiler.elseHas( ASTCompiler.EXTRA_NAME, call ) + ` {${newVar} = ${ASTCompiler.EXTRA_NAME}.${call}(${args.join( "," )})} `
                    );

                    this.variables.push( newVar );
                    arg = newVar;
                    if ( this.lastVariable )
                        this.body.pop();

                    this.lastVariable = arg;
                    break;
                case this.type.identifier:

                    arg               = this.buildIdentifier( item );
                    this.lastVariable = arg;
                    break;
                case this.type.bracketExpression:

                    newVar = this.createVar( -1 );
                    this.declarations.push( ASTCompiler.notNull( newVar ) + ` { ${newVar} = ${newVar}[${item.expression}] } else { ${newVar} = undefined } ` );
                    break;
                case "DOT":

                    if ( this.variablePath.length == 1 )
                        return;

                    arg = ".";
                    break;
                case this.type.filter:

                    if ( ASTCompiler.filterSupported ) {
                        arg = "$filter(\"" + item.expression + "\")(";
                        forEach( item.arguments, ( argument ) => {
                            arg += iterateArguments( argument );
                        } );

                        arg += ")";
                    }
                    break;
                case this.type.expression:

                    forEach( item.expression.split( "." ), item => {
                        arg = this.buildIdentifier( { type: "IDENTIFIER", expression: item } );
                    } );
                    this.variablePath.push( arg );
                    this.lastVariable = arg;
                    break;
                default:
                    arg = item.expression;
            }
            this.resetPath( item );
            return arg;
        };

        forEach( scope, item => {

            const it = iterateArguments( item );
            if ( it )
                this.body.push( it );
        } );

        return this;
    }

    generate () {

        let fnString = "\nreturn function(" + ASTCompiler.SCOPE_NAME + "," + ASTCompiler.EXTRA_NAME + ") {\n";
        if ( this.variables.length )
            fnString += "var " + this.variables.join( ", " ) + ";\n";

        if ( this.declarations.length )
            fnString += this.declarations.join( "\n" ) + "\n";

        fnString += "return " + this.body.join( "" ) + ";\n}";
        return fnString;
    }
}

function forEach ( object, callback ) {
    for ( let i in object )
        if ( object.hasOwnProperty( i ) )
            callback( object[ i ], ( i.match( /^\d*$/ ) ? parseInt( i ) : i ) );
}

function compile ( self, exp ) {

    const scope = [],
          lexer = new Lexer( exp ).tokens;
    let index   = 0,
        item    = lexer[ index ];

    while ( index < lexer.length ) {

        const part = self.compilePart( item, index, lexer );

        if ( part ) {

            scope.push( part );
            index += part.length;

        } else {
            index++;
        }

        item = lexer[ index ];
    }
    return scope;
}