"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Lexer_js_1 = require("node_modules/@mephiztopheles/lexer/Lexer.js");
var ASTCompiler = /** @class */ (function () {
    function ASTCompiler(expression) {
        this.expression = expression;
        this.varCount = 0;
        this.opened = 0;
        this.type = {
            "function": "FUNCTION",
            "bracketExpression": "BRACKETEXPRESSION",
            "identifier": "IDENTIFIER",
            "literal": "LITERAL",
            "filter": "FILTER",
            "expression": "EXPRESSION",
            "functionCall": "FUNCTIONCALL"
        };
        this.functionCount = [];
        this.variablePath = [];
        this.lastVariable = "";
        this.variables = [];
        this.declarations = [];
        this.body = [];
    }
    Object.defineProperty(ASTCompiler.prototype, "currentScope", {
        get: function () {
            return this.lastVariable || ASTCompiler.SCOPE_NAME;
        },
        enumerable: true,
        configurable: true
    });
    ASTCompiler.if = function (scope, property, varName) {
        return ASTCompiler.isIn(scope, property) + (" { " + varName + " = " + scope + "." + property + " } ") + ASTCompiler.elseIn(ASTCompiler.EXTRA_NAME, property) + (" { " + varName + " = " + ASTCompiler.EXTRA_NAME + "." + property + " }");
    };
    ASTCompiler.notNull = function (varName) {
        return "if( " + varName + " !== undefined && " + varName + " !== null )";
    };
    ASTCompiler.isIn = function (object, property) {
        return "if( " + object + " && \"" + property + "\" in " + object + " )";
    };
    ASTCompiler.elseIn = function (object, property) {
        return "else " + ASTCompiler.isIn(object, property);
    };
    ASTCompiler.has = function (object, name) {
        return "if( " + object + " && typeof " + object + "." + name + " != \"undefined\" )";
    };
    ASTCompiler.elseHas = function (object, name) {
        return "else " + ASTCompiler.has(object, name);
    };
    ASTCompiler.isKeyword = function (value) {
        return value == "true" || value == "false";
    };
    ASTCompiler.prototype.buildIdentifier = function (item) {
        if (ASTCompiler.isKeyword(item.expression))
            return item.expression;
        var v = this.createVar(), exp = item.expression, p = this.variablePath.length ? this.variablePath[this.variablePath.length - 1] : ASTCompiler.SCOPE_NAME;
        this.declarations.push(ASTCompiler.if(p, exp, v));
        this.variables.push(v);
        this.variablePath.push(v);
        return v;
    };
    ASTCompiler.prototype.createVar = function (add) {
        var v = "v" + (this.varCount + (add || 0));
        if (add === undefined)
            this.varCount++;
        return v;
    };
    ASTCompiler.prototype.resetPath = function (item) {
        switch (item.type) {
            case "IDENTIFIER":
            case "STRING":
            case "NUMBER":
                return false;
        }
        this.lastVariable = "";
        this.variablePath.length = 0;
        return true;
    };
    ASTCompiler.prototype.isFilterExpression = function (item, index, lexer) {
        var _index = index, name = "", opened = 0, _item = item;
        if (!lexer[index + 1])
            return false;
        function openClose() {
            if (_item) {
                if (_item.value === "(" && lexer[_index + 1] && lexer[_index + 1].value !== ")")
                    open();
                else if (_item.value === ")" && lexer[_index - 1] && lexer[_index - 1].value !== "(")
                    close();
            }
        }
        function open() {
            opened++;
        }
        function close() {
            opened--;
        }
        function checkValue() {
            switch (_item.key) {
                case "IDENTIFIER":
                case "DOT":
                case "NUMBER":
                case "STRING":
                    return false;
            }
            return true;
        }
        if (checkValue())
            return false;
        while (_item && _item.value !== "|") {
            openClose();
            if (checkValue())
                return false;
            name += _item.value;
            _index++;
            _item = lexer[_index];
        }
        _index++;
        _item = lexer[_index];
        if (_item && _item.value !== "|") {
            var declaration = {
                type: this.type.filter,
                index: _index,
                length: _index - index,
                arguments: [],
                expression: _item.value
            };
            _index++;
            _item = lexer[_index];
            declaration.arguments.push(compile(this, name)[0]);
            while (_item && _item.value !== ")") {
                if (_item.value === ":") {
                    declaration.arguments.push({ type: "COMMA", expression: "," });
                    _index++;
                }
                else {
                    var part = this.compilePart(_item, _index, lexer);
                    if (part) {
                        declaration.arguments.push(part);
                        _index += part.length;
                    }
                    else {
                        _index++;
                    }
                }
                _item = lexer[_index];
            }
            declaration.length = _index - index;
            return declaration;
        }
    };
    ASTCompiler.prototype.isBraceExpression = function (item, index, lexer) {
        var _index = index, name = "", open = false, _item = item;
        if (!lexer[index + 1])
            return false;
        function checkValue() {
            switch (_item.key) {
                case "IDENTIFIER":
                case "L_BRACKET":
                case "NUMBER":
                case "STRING":
                    return false;
            }
            return true;
        }
        if (_item.value !== "[")
            return;
        while (_item && _item.value !== "]") {
            if (checkValue())
                return false;
            if (_item.value === "[")
                open = true;
            if (open)
                name += _item.value;
            _index++;
            _item = lexer[_index];
        }
        if (open) {
            return {
                type: this.type.bracketExpression,
                index: _index + 1,
                length: (_index - index) + 1,
                expression: name.substr(1)
            };
        }
    };
    ASTCompiler.prototype.isFunctionExpression = function (item, index, lexer) {
        var _this = this;
        var _index = index, name = "", _item = item;
        if (!lexer[index + 1])
            return false;
        function checkValue() {
            switch (_item.key) {
                case "IDENTIFIER":
                case "DOT":
                    return true;
            }
            return false;
        }
        if (!checkValue())
            return false;
        while (_item && _item.value !== "(") {
            if (!checkValue())
                return false;
            name += _item.value;
            _index++;
            _item = lexer[_index];
        }
        if (_index === lexer.length)
            return false;
        if (name[0] === ".")
            name = name.substr(1);
        var openClose = function () {
            if (_item) {
                if (_item.value === "(" && lexer[_index + 1] && lexer[_index + 1].value !== ")")
                    _this.opened++;
                else if (_item.value === ")" && lexer[_index - 1] && lexer[_index - 1].value !== "(")
                    _this.opened--;
            }
        };
        if (index !== _index) {
            openClose();
            var declaration = {
                type: this.type.function,
                index: _index,
                length: _index - index,
                arguments: [],
                expression: name
            };
            if (lexer[_index + 1] && lexer[_index + 1].value === ")") {
                declaration.index += 2;
                declaration.length += 2;
                return declaration;
            }
            _index++;
            _item = lexer[_index];
            while (_item && (this.opened > 1 ? true : _item.value !== ")")) {
                var part = this.compilePart(_item, _index, lexer);
                if (part) {
                    if (part.expression !== "," && part.expression !== ")")
                        declaration.arguments.push(part);
                    _index += part.length;
                }
                else {
                    _index++;
                }
                openClose();
                _item = lexer[_index];
            }
            _index++;
            declaration.length = _index - index;
            return declaration;
        }
        return false;
    };
    ASTCompiler.prototype.isExpression = function (item, index, lexer) {
        var _index = index, name = "", _item = item;
        if (!lexer[index + 1])
            return false;
        function checkValue() {
            switch (_item.key) {
                case "IDENTIFIER":
                case "DOT":
                    return true;
            }
            return false;
        }
        while (_item && checkValue()) {
            name += _item.value;
            _index++;
            _item = lexer[_index];
        }
        if (lexer[index + 1] && lexer[index + 1].key == "DOT") {
            var functionExpression = this.isFunctionExpression(lexer[index + 1], index + 1, lexer);
            if (functionExpression) {
                functionExpression.index = _index;
                functionExpression.length += _index - index + 1;
                functionExpression.expression = _item.value + "." + functionExpression.expression;
                return functionExpression;
            }
        }
        if (index !== _index) {
            return {
                type: this.type.expression,
                index: _index,
                length: _index - index,
                expression: name
            };
        }
    };
    ASTCompiler.prototype.compilePart = function (item, index, lexer) {
        var isFunctionExpression = this.isFunctionExpression(item, index, lexer);
        if (isFunctionExpression)
            return isFunctionExpression;
        var isFilterExpression = this.isFilterExpression(item, index, lexer);
        if (isFilterExpression)
            return isFilterExpression;
        var isBraceExpression = this.isBraceExpression(item, index, lexer);
        if (isBraceExpression)
            return isBraceExpression;
        var isExpression = this.isExpression(item, index, lexer);
        if (isExpression)
            return isExpression;
        return {
            type: item.key,
            length: 1,
            index: index,
            expression: item.value
        };
    };
    ASTCompiler.prototype.compile = function () {
        var _this = this;
        var scope = compile(this, this.expression);
        var iterateArguments = function (item) {
            var arg = "", newVar;
            switch (item.type) {
                case _this.type.literal:
                    arg = _this.createVar();
                    var exp = item.expression;
                    _this.declarations.push(arg + " = " + exp);
                    _this.variables.push(arg);
                    _this.variablePath.push(arg);
                    _this.variablePath.push(arg);
                    _this.functionCount.push(arg);
                    _this.lastVariable = arg;
                    break;
                case _this.type.function:
                    var currentVarName = void 0, expressions = item.expression.split("."), args_1 = [], call = expressions.pop();
                    if (_this.functionCount.length) {
                        currentVarName = _this.functionCount[_this.functionCount.length - 1];
                        _this.body.pop();
                    }
                    else {
                        currentVarName = _this.currentScope;
                        _this.functionCount.push(currentVarName);
                    }
                    forEach(item.arguments, function (argument) {
                        args_1.push(iterateArguments(argument));
                    });
                    var type = _this.type.expression;
                    if (expressions.length) {
                        var expression = expressions.join(".");
                        if (expression.match(/(^")|^\d+$/))
                            type = _this.type.literal;
                        currentVarName = iterateArguments({
                            type: type,
                            expression: expression
                        });
                    }
                    newVar = _this.createVar();
                    _this.functionCount.push(newVar);
                    _this.declarations.push(ASTCompiler.has(currentVarName, call) + (" { " + newVar + " = " + currentVarName + "." + call + "(" + args_1.join(",") + ")} ") + ASTCompiler.elseHas(ASTCompiler.EXTRA_NAME, call) + (" {" + newVar + " = " + ASTCompiler.EXTRA_NAME + "." + call + "(" + args_1.join(",") + ")} "));
                    _this.variables.push(newVar);
                    arg = newVar;
                    if (_this.lastVariable)
                        _this.body.pop();
                    _this.lastVariable = arg;
                    break;
                case _this.type.identifier:
                    arg = _this.buildIdentifier(item);
                    _this.lastVariable = arg;
                    break;
                case _this.type.bracketExpression:
                    newVar = _this.createVar(-1);
                    _this.declarations.push(ASTCompiler.notNull(newVar) + (" { " + newVar + " = " + newVar + "[" + item.expression + "] } else { " + newVar + " = undefined } "));
                    break;
                case "DOT":
                    if (_this.variablePath.length == 1)
                        return;
                    arg = ".";
                    break;
                case _this.type.filter:
                    if (ASTCompiler.filterSupported) {
                        arg = "$filter(\"" + item.expression + "\")(";
                        forEach(item.arguments, function (argument) {
                            arg += iterateArguments(argument);
                        });
                        arg += ")";
                    }
                    break;
                case _this.type.expression:
                    forEach(item.expression.split("."), function (item) {
                        arg = _this.buildIdentifier({ type: "IDENTIFIER", expression: item });
                    });
                    _this.variablePath.push(arg);
                    _this.lastVariable = arg;
                    break;
                default:
                    arg = item.expression;
            }
            _this.resetPath(item);
            return arg;
        };
        forEach(scope, function (item) {
            var it = iterateArguments(item);
            if (it)
                _this.body.push(it);
        });
        return this;
    };
    ASTCompiler.prototype.generate = function () {
        var fnString = "\nreturn function(" + ASTCompiler.SCOPE_NAME + "," + ASTCompiler.EXTRA_NAME + ") {\n";
        if (this.variables.length)
            fnString += "var " + this.variables.join(", ") + ";\n";
        if (this.declarations.length)
            fnString += this.declarations.join("\n") + "\n";
        fnString += "return " + this.body.join("") + ";\n}";
        return fnString;
    };
    ASTCompiler.EXTRA_NAME = "l";
    ASTCompiler.SCOPE_NAME = "s";
    ASTCompiler.filterSupported = false;
    return ASTCompiler;
}());
exports.default = ASTCompiler;
function forEach(object, callback) {
    for (var i in object)
        if (object.hasOwnProperty(i))
            callback(object[i], (i.match(/^\d*$/) ? parseInt(i) : i));
}
function compile(self, exp) {
    var scope = [], lexer = new Lexer_js_1.default(exp).tokens;
    var index = 0, item = lexer[index];
    while (index < lexer.length) {
        var part = self.compilePart(item, index, lexer);
        if (part) {
            scope.push(part);
            index += part.length;
        }
        else {
            index++;
        }
        item = lexer[index];
    }
    return scope;
}
