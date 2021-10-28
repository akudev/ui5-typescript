interface ManagedObjectInfo {
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
}

interface RequiredImports {
  [key: string]: { localName: string; moduleName: string; exportName?: string };
}

interface APIMember {
  name: string;
  doc?: string;
  since?: string;
  deprecation?: string;
  experimental?: string;
  visibility?: string;
}

interface APIMemberWithMethods extends APIMember {
  methods: { [key: string]: string };
}

interface APIMemberWithType extends APIMember {
  type: string;
}

interface Property extends APIMemberWithMethods, APIMemberWithType {
  defaultValue?: any;
  bindable?: boolean;
}

interface Aggregation extends APIMemberWithMethods, APIMemberWithType {
  cardinality: "0..1" | "0..n";
  altTypes: string;
  //dnd: any,
  singularName: string;
  bindable: boolean;
}

interface Association extends APIMemberWithMethods, APIMemberWithType {
  cardinality: "0..1" | "0..n";
  singularName: string;
}

interface UI5Event extends APIMemberWithMethods {
  allowPreventDefault: boolean;
  enableEventBubbling: boolean;
  parameters: { [key: string]: EventParameter };
}

interface EventParameter {
  name: string;
  doc: string;
  deprecation: string;
  since: string;
  experimental: string;
  type: string;
}

interface SpecialSetting extends APIMemberWithType {}

interface ClassInfo {
  name?: string;
  interfaces?: string[];
  doc?: string;
  deprecation?: string;
  since?: string;
  experimental?: string;
  specialSettings?: { [key: string]: SpecialSetting };
  properties?: { [key: string]: Property };
  defaultProperty?: string;
  aggregations?: { [key: string]: Aggregation };
  defaultAggregation?: string;
  associations?: { [key: string]: Association };
  events?: { [key: string]: UI5Event };
  methods?: {};
  annotations?: {};
  designtime?: boolean | string;
  designTime?: boolean | string;
  stereotype?: null;
  metadataClass?: undefined;
  library?: string;
  //dnd: any,

  abstract?: boolean;
  final?: boolean;
}

interface ClassDoclet {
  description: string;
  deprecated: string;
  since: string;
  experimental: string;
  augments: string;
}
