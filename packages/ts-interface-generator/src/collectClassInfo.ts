const rPlural = /(children|ies|ves|oes|ses|ches|shes|xes|s)$/i;
const mSingular: { [key: string]: string | number } = {
  children: -3,
  ies: "y",
  ves: "f",
  oes: -2,
  ses: -2,
  ches: -2,
  shes: -2,
  xes: -2,
  s: -1,
};

function collectClassInfo(metadata: ClassInfo, className: string) {
  // mostly rewritten in TypeScript based on lines 732-988 in https://github.com/SAP/openui5/blob/master/lib/jsdoc/ui5/plugin.js
  let classDoclet: ClassDoclet = null; // TODO

  /*	
let baseType;
	if ( classDoclet && classDoclet.augments && classDoclet.augments.length === 1 ) {
		baseType = classDoclet.augments[0];
	}
	if ( extendCall.callee.type === Syntax.MemberExpression ) {
		const baseCandidate = getResolvedObjectName(extendCall.callee.object);
		if ( baseCandidate && baseType == null ) {
			baseType = baseCandidate;
		} else if ( baseCandidate !== baseType ) {
			console.warn(`documented base type '${baseType}' doesn't match technical base type '${baseCandidate}'`);
		}
	}
	*/
  const oClassInfo: ClassInfo = {
    name: className, // was: extendCall.arguments[0].value,
    //baseType : baseType,
    interfaces: [],
    doc: classDoclet && classDoclet.description,
    deprecation: classDoclet && classDoclet.deprecated,
    since: classDoclet && classDoclet.since,
    experimental: classDoclet && classDoclet.experimental,
    specialSettings: {},
    properties: {},
    aggregations: {},
    associations: {},
    events: {},
    methods: {},
    annotations: {},
    designtime: false,
    designTime: false,
    stereotype: null,
    metadataClass: undefined,
    defaultProperty: undefined,
    defaultAggregation: undefined,
    abstract: false,
    final: false,
    library: undefined,
  };

  function upper(n: string) {
    return n.slice(0, 1).toUpperCase() + n.slice(1);
  }

  function each(
    map: { [key: string]: APIMember },
    defaultKey: string,
    callback: (
      n: string,
      settings: any,
      doc: ClassDoclet,
      apiMember: APIMember
    ) => void
  ) {
    if (map) {
      for (let n in map) {
        if (map.hasOwnProperty(n)) {
          //const doclet = getLeadingDoclet(map[n]);
          const settings = expandDefaultKey(map[n], defaultKey);
          if (settings == null) {
            console.warn(`no valid metadata for ${n} (AST type '${map[n]}')`);
            continue;
          }

          callback(n, settings, null /* was: doclet */, map[n]);
        }
      }
    }
  }

  /*
	if ( extendCall.arguments.length > 2 ) {
		// new class defines its own metadata class type
		const metadataClass =  getResolvedObjectName(extendCall.arguments[2]);
		if ( metadataClass ) {
			oClassInfo.metadataClass = getResolvedObjectName(extendCall.arguments[2]);
			debug(`found metadata class name '${oClassInfo.metadataClass}'`);
		} else {
			future(`cannot understand metadata class parameter (AST node type '${extendCall.arguments[2].type}')`);
		}
	}
	
	const classInfoNode = extendCall.arguments[1];
	const classInfoMap = createPropertyMap(classInfoNode);
	if ( classInfoMap && classInfoMap.metadata && classInfoMap.metadata.value.type !== Syntax.ObjectExpression ) {
		warning(`class metadata exists but can't be analyzed. It is not of type 'ObjectExpression', but a '${classInfoMap.metadata.value.type}'.`);
		return null;
	}

	const metadata = classInfoMap && classInfoMap.metadata && createPropertyMap(classInfoMap.metadata.value);
	*/
  if (metadata) {
    //console.log(`  analyzing metadata for '${oClassInfo.name}'`);

    // Read the stereotype information from the metadata
    oClassInfo.stereotype =
      (metadata.stereotype && metadata.stereotype) || undefined;

    oClassInfo.library = (metadata.library && metadata.library) || undefined;

    oClassInfo["abstract"] = !!(metadata["abstract"] && metadata["abstract"]);
    oClassInfo["final"] = !!(metadata["final"] && metadata["final"]);
    //oClassInfo.dnd = metadata.dnd && convertDragDropValue(metadata.dnd);

    if (metadata.interfaces) {
      oClassInfo.interfaces = metadata.interfaces;
    }

    each(
      metadata.specialSettings,
      "type",
      (n, settings, doclet: ClassDoclet) => {
        oClassInfo.specialSettings[n] = {
          name: n,
          doc: doclet && doclet.description,
          since: doclet && doclet.since,
          deprecation: doclet && doclet.deprecated,
          experimental: doclet && doclet.experimental,
          visibility: (settings.visibility && settings.visibility) || "public",
          type: settings.type ? settings.type : "any",
        };
      }
    );

    oClassInfo.defaultProperty =
      (metadata.defaultProperty && metadata.defaultProperty) || undefined;

    each(
      metadata.properties,
      "type",
      (n: string, settings, doclet: ClassDoclet) => {
        let type;
        const N = upper(n);
        let methods: { [key: string]: string };
        oClassInfo.properties[n] = {
          name: n,
          doc: doclet && doclet.description,
          since: doclet && doclet.since,
          deprecation: doclet && doclet.deprecated,
          experimental: doclet && doclet.experimental,
          visibility: settings.visibility || "public",
          type: (type = settings.type || "string"),
          defaultValue: settings.defaultValue, // ? convertValueWithRaw(settings.defaultValue, type, n) : null,
          bindable: settings.bindable ? !!settings.bindable : false,
          methods: (methods = {
            get: "get" + N,
            set: "set" + N,
          }),
        };
        if (oClassInfo.properties[n].bindable) {
          methods["bind"] = "bind" + N;
          methods["unbind"] = "unbind" + N;
        }
        // if ( !settings.defaultValue ) {
        //	console.log("property without defaultValue: " + oClassInfo.name + "." + n);
        //}
      }
    );

    oClassInfo.defaultAggregation =
      (metadata.defaultAggregation && metadata.defaultAggregation) || undefined;

    each(
      metadata.aggregations,
      "type",
      (n: string, settings, doclet: ClassDoclet) => {
        const N = upper(n);
        let methods: { [key: string]: string };
        const aggr = (oClassInfo.aggregations[n] = {
          name: n,
          doc: doclet && doclet.description,
          deprecation: doclet && doclet.deprecated,
          since: doclet && doclet.since,
          experimental: doclet && doclet.experimental,
          visibility: (settings.visibility && settings.visibility) || "public",
          type: settings.type ? settings.type : "sap.ui.core.Control",
          altTypes: settings.altTypes ? settings.altTypes : undefined,
          singularName: settings.singularName
            ? settings.singularName
            : guessSingularName(n),
          cardinality:
            settings.multiple !== undefined && !settings.multiple
              ? "0..1"
              : "0..n",
          bindable: settings.bindable, // TODO: was:  ? !!convertValue(settings.bindable) : false,
          methods: (methods = {
            get: "get" + N,
            destroy: "destroy" + N,
          }),
        });

        //aggr.dnd = settings.dnd && convertDragDropValue(settings.dnd, aggr.cardinality);

        if (aggr.cardinality === "0..1") {
          methods["set"] = "set" + N;
        } else {
          const N1 = upper(aggr.singularName);
          methods["insert"] = "insert" + N1;
          methods["add"] = "add" + N1;
          methods["remove"] = "remove" + N1;
          methods["indexOf"] = "indexOf" + N1;
          methods["removeAll"] = "removeAll" + N;
        }
        if (aggr.bindable) {
          methods["bind"] = "bind" + N;
          methods["unbind"] = "unbind" + N;
        }
      }
    );

    each(
      metadata.associations,
      "type",
      (n: string, settings, doclet: ClassDoclet) => {
        const N = upper(n);
        let methods: { [key: string]: string };
        oClassInfo.associations[n] = {
          name: n,
          doc: doclet && doclet.description,
          deprecation: doclet && doclet.deprecated,
          since: doclet && doclet.since,
          experimental: doclet && doclet.experimental,
          visibility: (settings.visibility && settings.visibility) || "public",
          type: settings.type ? settings.type : "sap.ui.core.Control",
          singularName: settings.singularName
            ? settings.singularName
            : guessSingularName(n),
          cardinality: settings.multiple && settings.multiple ? "0..n" : "0..1",
          methods: (methods = {
            get: "get" + N,
          }),
        };
        if (oClassInfo.associations[n].cardinality === "0..1") {
          methods["set"] = "set" + N;
        } else {
          const N1 = upper(oClassInfo.associations[n].singularName);
          methods["add"] = "add" + N1;
          methods["remove"] = "remove" + N1;
          methods["removeAll"] = "removeAll" + N;
        }
      }
    );

    each(metadata.events, null, (n: string, settings, doclet: ClassDoclet) => {
      const N = upper(n);
      const info: UI5Event = (oClassInfo.events[n] = {
        name: n,
        doc: doclet && doclet.description,
        deprecation: doclet && doclet.deprecated,
        since: doclet && doclet.since,
        experimental: doclet && doclet.experimental,
        visibility:
          /* (settings.visibility && settings.visibility) || */ "public",
        allowPreventDefault: !!(
          settings.allowPreventDefault && settings.allowPreventDefault
        ),
        enableEventBubbling: !!(
          settings.enableEventBubbling && settings.enableEventBubbling
        ),
        parameters: {},
        methods: {
          attach: "attach" + N,
          detach: "detach" + N,
          fire: "fire" + N,
        },
      });
      each(
        settings.parameters,
        "type",
        (pName: string, pSettings, pDoclet: ClassDoclet) => {
          info.parameters[pName] = {
            name: pName,
            doc: pDoclet && pDoclet.description,
            deprecation: pDoclet && pDoclet.deprecated,
            since: pDoclet && pDoclet.since,
            experimental: pDoclet && pDoclet.experimental,
            type: pSettings && pSettings.type ? pSettings.type : "",
          };
        }
      );
    });

    const designtime = metadata.designtime || metadata.designTime; // convertValue removed
    if (typeof designtime === "string" || typeof designtime === "boolean") {
      oClassInfo.designtime = designtime;
    }
    // console.log(oClassInfo.name + ":" + JSON.stringify(oClassInfo, null, "  "));
  }

  /*
	if (currentModule.defaultExport
		&& currentModule.localNames[currentModule.defaultExport]
		&& currentModule.localNames[currentModule.defaultExport].class === oClassInfo.name) {
		// debug("class " + oClassInfo.name + " identified as default export of module " + currentModule.module);
		oClassInfo.export = "";
	} else if (currentModule.defaultExportClass
			   && currentModule.defaultExportClass === oClassInfo.name) {
		// debug("class " + oClassInfo.name + " identified as default export of module " + currentModule.module + " (immediate return)");
		oClassInfo.export = "";
	}

	// remember class info by name
	classInfos[oClassInfo.name] = oClassInfo;
	*/
  return oClassInfo;
}

/**
 * Creates a map of property values from a JS object.
 *
 * @param {object} node
 * @param {string} [defaultKey=undefined] A default key to use for simple values
 * @returns {Map<string,Property>} Map of AST nodes of type 'Property', keyed by their property name
 */
function expandDefaultKey(node: APIMember, defaultKey: string) {
  if (node != null) {
    // if, instead of an object literal only a string is given and there is a defaultKey, then wrap the literal
    if (typeof node === "string" && defaultKey != null) {
      let result: { [key: string]: never } = {};
      result[defaultKey] = node;
      return result;
    }
  }
  return node;
}

function guessSingularName(sPluralName: string) {
  return sPluralName.replace(rPlural, ($, sPlural) => {
    const vRepl = mSingular[sPlural.toLowerCase()];
    return typeof vRepl === "string" ? vRepl : sPlural.slice(0, vRepl);
  });
}

export default collectClassInfo;
