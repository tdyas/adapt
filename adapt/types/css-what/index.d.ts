import { FlowArrayMutation } from "typescript";

declare namespace parser {
    export interface ParserOptions {
        xmlMode: boolean;
    }

    export interface Tag {
        type: 'tag';
        name: string;
    }

    export interface Universal {
        type: 'universal';
    }

    export interface Pseudo {
        type: 'pseudo';
        name: string;
        data?: string;
    }

    export interface Attribute {
        type: 'attribute';
        name: string;
        action: "exists" | "equals" | "element" | "start" | "end" | "any" | "not" | "hypen";
        value: string;
        ignoreCase: boolean;
    }

    export interface Descendant {
        type: 'descendant';
    }

    export interface Child {
        type: 'child';
    }

    export type ParsedSelectorFrag =
        | Tag
        | Universal
        | Pseudo
        | Attribute
        | Descendant
        | Child;
        
    export type ParsedSelectorBlock = ParsedSelectorFrag[];
    export type ParsedSelector = ParsedSelectorBlock[];
}

declare function parser(selector: string,
    options?: parser.ParserOptions): parser.ParsedSelector;
export = parser;