import path = require("path");
import fs = require("fs");
import ts = require("typescript");
import Hjson = require("hjson");
import collectClassInfo from "./collectClassInfo";
import {
  generateMethods,
  generateSettingsInterface,
  addLineBreakBefore,
} from "./astGenerationHelper";
import astToString from "./astToString";

const interestingBaseClasses: {
  [key: string]:
    | "ManagedObject"
    | "EventProvider"
    | "Element"
    | "Control"
    | undefined;
} = {
  '"sap/ui/base/ManagedObject".ManagedObject': "ManagedObject",
  '"sap/ui/base/EventProvider".EventProvider': "EventProvider",
  '"sap/ui/core/Element".UI5Element': "Element",
  '"sap/ui/core/Control".Control': "Control",
};

/**
 * Checks the given source file for any classes derived from sap.ui.base.ManagedObject and generates for each one an interface file next to the source file
 * with the name <className>.generated.tsinterface.ts
 *
 * @param sourceFile
 * @param typeChecker
 * @param allKnownGlobals
 * @param {function} [resultProcessor]
 *
 * @public
 */
function generateInterfaces(
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
  allKnownGlobals: {
    [key: string]: { moduleName: string; exportName?: string };
  },
  resultProcessor: (
    sourceFileName: string,
    className: string,
    interfaceText: string
  ) => void = writeInterfaceFile
) {
  const mos = getManagedObjects(sourceFile, typeChecker);
  mos.forEach((managedObjectOccurrence) => {
    const interfaceText = generateInterface(
      managedObjectOccurrence,
      allKnownGlobals
    ); // only returns the interface text if actually needed (it's not for ManagedObjects without metadata etc.)
    if (interfaceText) {
      resultProcessor(
        sourceFile.fileName,
        managedObjectOccurrence.className,
        interfaceText
      );
    }
  });
}

/**
 *
 * @param sourceFileName the complete path and name of the original source file, so the generated file can be placed next to it
 * @param className the name of the class for which the interface shall be generated (there may be several classes within one sourceFile)
 * @param interfaceText the interface file content to write
 */
function writeInterfaceFile(
  sourceFileName: string,
  className: string,
  interfaceText: string
) {
  // file output
  const pathName = path.dirname(sourceFileName);
  const newFileName = path.join(
    pathName,
    className + ".generated.tsinterface.ts"
  );
  console.log("Writing interface file: " + newFileName + "\n\n");
  fs.writeFileSync(newFileName, interfaceText);
}

function getManagedObjects(
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker
) {
  const managedObjects: ManagedObjectInfo[] = [];
  sourceFile.statements.forEach((statement) => {
    if (ts.isClassDeclaration(statement)) {
      let managedObjectFound = false;
      statement.heritageClauses &&
        statement.heritageClauses.forEach((heritageClause) => {
          heritageClause.types &&
            heritageClause.types.forEach((typeNode) => {
              const type = typeChecker.getTypeFromTypeNode(typeNode);
              const symbol = type.getSymbol();
              if (!symbol) {
                throw new Error(
                  "Type '" +
                    typeNode.getText() +
                    "' in " +
                    sourceFile.fileName +
                    " could not be resolved - are the UI5 (and other) type definitions available and known in the tsconfig? Or is there a different reason why this type would not be known?"
                );
              }
              const settingsTypeNode = getSettingsType(type);
              if (settingsTypeNode) {
                const settingsType = typeChecker.getTypeFromTypeNode(
                  settingsTypeNode
                );
                const symbol = settingsType.getSymbol();
                const settingsTypeFullName = typeChecker.getFullyQualifiedName(
                  symbol
                );
                const interestingBaseClass = getInterestingBaseClass(
                  type,
                  typeChecker
                );
                if (interestingBaseClass) {
                  managedObjectFound = true;
                  const constructorSignaturesAvailable = checkConstructors(
                    statement
                  );
                  managedObjects.push({
                    sourceFile,
                    className: statement.name ? statement.name.text : "",
                    classDeclaration: statement,
                    settingsTypeFullName,
                    interestingBaseClass,
                    constructorSignaturesAvailable,
                  });
                  return;
                }
              }
            });
          if (managedObjectFound) {
            // do not look at any other heritage clauses
            return;
          }
        });
    }
  });
  return managedObjects;
}

// checks for the presence of the standard constructor signatures, so the tool can report them as missing
function checkConstructors(classDeclaration: ts.ClassDeclaration) {
  let singleParameterDeclarationFound = false,
    doubleParameterDeclarationFound = false,
    implementationFound = false;

  classDeclaration.members.forEach((member: ts.ClassElement) => {
    if (ts.isConstructorDeclaration(member)) {
      if (member.parameters.length === 1 && member.body === undefined) {
        const parameter = member.parameters[0];
        if (parameter.questionToken && ts.isUnionTypeNode(parameter.type)) {
          if (parameter.type.types.length === 2) {
            if (
              isOneAStringAndTheOtherASettingsObject(
                parameter.type.types[0],
                parameter.type.types[1]
              )
            ) {
              singleParameterDeclarationFound = true;
            }
          }
        }
      } else if (member.parameters.length === 2) {
        if (
          isOneAStringAndTheOtherASettingsObject(
            member.parameters[0].type,
            member.parameters[1].type
          )
        ) {
          if (member.body) {
            implementationFound = true;
          } else {
            doubleParameterDeclarationFound = true;
          }
        }
      } else {
        console.log(
          "Unexpected constructor signature with a parameter number other than 1 or 2 in class " +
            member.parent.name.text
        );
      }
    }
  });

  const found =
    singleParameterDeclarationFound &&
    doubleParameterDeclarationFound &&
    implementationFound;
  if (!found) {
    console.log(
      classDeclaration.name.text +
        " is missing required constructor signatures: " +
        (singleParameterDeclarationFound
          ? ""
          : "\n- constructor declaration with single parameter") +
        (doubleParameterDeclarationFound
          ? ""
          : "\n- constructor declaration with two parameters") +
        (implementationFound
          ? ""
          : "\n- constructor implementation with two parameters")
    );
  }
  return found;
}

function isOneAStringAndTheOtherASettingsObject(
  type1: ts.TypeNode,
  type2: ts.TypeNode
) {
  return (
    (type1.kind === ts.SyntaxKind.StringKeyword &&
      ts.isTypeReferenceNode(type2)) || // TODO: more specific check for second type
    (type2.kind === ts.SyntaxKind.StringKeyword &&
      ts.isTypeReferenceNode(type1))
  );
}

/**
 * Returns the type of the settings object used in the constructor of the given type
 * Needed to derive the new settings object type for the subclass from it.
 *
 * @param type
 */
function getSettingsType(type: ts.Type) {
  const declarations = type.getSymbol().getDeclarations();
  const constructors: ts.ConstructorDeclaration[] = [];
  for (let i = 0; i < declarations.length; i++) {
    const declaration = declarations[i] as ts.ClassDeclaration;
    const members = declaration.members;
    for (let j = 0; j < members.length; j++) {
      if (ts.isConstructorDeclaration(members[j])) {
        constructors.push(members[j] as ts.ConstructorDeclaration);
      }
    }
  }

  let settingsType: ts.TypeNode = null;
  constructors.forEach((ctor) => {
    const lastParameter = ctor.parameters[ctor.parameters.length - 1];
    //if (settingsType !== null && settingsType.typeName.escapedText !== lastParameter.type.typeName.escapedText) {  // TODO
    //	console.warn("different constructors have different settings type")
    //}
    if (lastParameter.type.kind === ts.SyntaxKind.TypeReference) {
      // without this check, we get incorrect settings types from e.g. controllers which have a different constructor structure  TODO: check for more deviations
      settingsType = lastParameter.type;
    }
  });
  return settingsType;
}

/**
 * Returns "ManagedObject", "EventProvider", "Element", "Control" - or undefined
 */
function getInterestingBaseClass(
  type: ts.Type,
  typeChecker: ts.TypeChecker
): "ManagedObject" | "EventProvider" | "Element" | "Control" | undefined {
  const typeName = typeChecker.typeToString(type);
  //console.log("-> " + typeName + " (" + typeChecker.getFullyQualifiedName(type.getSymbol()) + ")");

  let interestingBaseClass =
    interestingBaseClasses[typeChecker.getFullyQualifiedName(type.getSymbol())];
  if (interestingBaseClass) {
    return interestingBaseClass;
  }
  if (!type.isClassOrInterface()) {
    return;
  }
  const baseTypes = typeChecker.getBaseTypes(type);
  for (let i = 0; i < baseTypes.length; i++) {
    if (
      (interestingBaseClass = getInterestingBaseClass(
        baseTypes[i],
        typeChecker
      ))
    ) {
      return interestingBaseClass;
    }
  }
  return undefined;
}

// const sourceFile = ts.createSourceFile("src/control/MyButton.ts", fs.readFileSync("src/control/MyButton.ts").toString(), ts.ScriptTarget.Latest);

function generateInterface(
  {
    sourceFile,
    className,
    classDeclaration,
    settingsTypeFullName,
    interestingBaseClass,
    constructorSignaturesAvailable,
  }: {
    sourceFile: ts.SourceFile;
    className: string;
    classDeclaration: ts.ClassDeclaration;
    settingsTypeFullName: string;
    interestingBaseClass:
      | "ManagedObject"
      | "EventProvider"
      | "Element"
      | "Control"
      | undefined;
    constructorSignaturesAvailable: boolean;
  },
  allKnownGlobals: {
    [key: string]: { moduleName: string; exportName?: string };
  }
) {
  const fileName = sourceFile.fileName;
  let metadata: ts.PropertyDeclaration[] = <ts.PropertyDeclaration[]>(
    classDeclaration.members.filter((member) => {
      if (
        ts.isPropertyDeclaration(member) &&
        ts.isIdentifier(member.name) &&
        member.name.escapedText === "metadata" &&
        member.modifiers.some((modifier) => {
          return modifier.kind === ts.SyntaxKind.StaticKeyword;
        })
      ) {
        return true;
      }
    })
  );
  if (!metadata || metadata.length !== 1) {
    // no metadata? => nothing to do
    //console.warn(`There should be one metadata object in a ManagedObject, but there are ${metadata.length} in ${className} inside ${fileName}`);
    return;
  }

  // by now we have something that looks pretty much like a ManagedObject metadata object

  const metadataText = metadata[0].initializer.getText(sourceFile);
  let metadataObject: { [key: string]: any };
  try {
    metadataObject = Hjson.parse(metadataText); // parse with some fault tolerance: it's not a real JSON object, but JS code which may contain comments and property names which are not enclosed in double quotes
  } catch (e) {
    throw new Error(
      `When parsing the metadata of ${className} in ${fileName}: metadata is no valid JSON and could not be quick-fixed to be. Please make the metadata at least close to valid JSON. In particular, TypeScript type annotations cannot be used. Error: ${
        (e as Error).message
      }`
    );
  }

  if (
    !metadataObject.properties &&
    !metadataObject.aggregations &&
    !metadataObject.associations &&
    !metadataObject.events
  ) {
    // No API for which accessors are generated? => no interface needed
    // FIXME // TODO: constructor may still be needed for inherited properties?
    return;
  }

  console.log(
    `\n\nClass ${className} inside ${fileName} inherits from ${interestingBaseClass} and contains metadata.`
  );

  const classInfo = collectClassInfo(metadataObject, className);

  const moduleName = path.basename(fileName, path.extname(fileName));
  const ast = buildAST(
    classInfo,
    sourceFile.fileName,
    constructorSignaturesAvailable,
    moduleName,
    settingsTypeFullName,
    allKnownGlobals
  );
  if (!ast) {
    // no interface needs to be generated
    return;
  }

  return astToString(ast);
}

function buildAST(
  classInfo: ClassInfo,
  classFileName: string,
  constructorSignaturesAvailable: boolean,
  moduleName: string,
  settingsTypeFullName: string,
  allKnownGlobals: {
    [key: string]: { moduleName: string; exportName?: string };
  }
) {
  const requiredImports = {};
  const methods = generateMethods(classInfo, requiredImports, allKnownGlobals);
  if (methods.length === 0) {
    // nothing needs to be generated!
    return null;
  }

  const settingsInterface = generateSettingsInterface(
    classInfo,
    classFileName,
    constructorSignaturesAvailable,
    settingsTypeFullName,
    requiredImports,
    allKnownGlobals
  );

  const statements: ts.Statement[] = getImports(requiredImports);

  const myInterface = ts.createInterfaceDeclaration(
    undefined,
    undefined,
    classInfo.name,
    undefined,
    undefined,
    methods
  );
  addLineBreakBefore(myInterface, 2);
  const module = ts.createModuleDeclaration(
    [],
    [ts.createModifier(ts.SyntaxKind.DeclareKeyword)],
    ts.createStringLiteral("./" + moduleName),
    ts.createModuleBlock([settingsInterface, myInterface])
  );
  if (statements.length > 0) {
    addLineBreakBefore(module, 2);
  }

  statements.push(module);
  return statements;
}

function getImports(requiredImports: RequiredImports) {
  const imports = [];
  for (let dependencyName in requiredImports) {
    const singleImport = requiredImports[dependencyName];
    const localNameIdentifier = ts.createIdentifier(singleImport.localName);
    const namedImportOriginalNameIdentifier =
      singleImport.exportName &&
      singleImport.localName !== singleImport.exportName
        ? ts.createIdentifier(singleImport.exportName)
        : undefined;

    let importClause;
    if (singleImport.exportName) {
      // if we have a named (non-default) export, we need a different import clause (with curly braces around the names to import)
      importClause = ts.createImportClause(
        undefined,
        ts.createNamedImports([
          ts.createImportSpecifier(
            namedImportOriginalNameIdentifier,
            localNameIdentifier
          ),
        ])
      );
    } else {
      importClause = ts.createImportClause(
        ts.createIdentifier(singleImport.localName),
        undefined
      ); // importing the default export, so only the local name matters
    }

    imports.push(
      ts.createImportDeclaration(
        undefined,
        undefined,
        importClause,
        ts.createStringLiteral(singleImport.moduleName)
      )
    );
  }

  if (!imports.length) {
    // this would result in an ambient module declaration which doesn't work for us. Enforce some implementation code to make it non-ambient.
    const importDeclaration = ts.createImportDeclaration(
      undefined,
      undefined,
      ts.createImportClause(ts.createIdentifier("Core"), undefined),
      ts.createStringLiteral("sap/ui/core/Core")
    );
    ts.addSyntheticTrailingComment(
      importDeclaration,
      ts.SyntaxKind.SingleLineCommentTrivia,
      " dummy import to make this non-ambient"
    );
    imports.push(importDeclaration);
  }

  return imports;
}

export { generateInterfaces };