import { DiplomatProject } from "../exchange_types";
import {BaseProjectTests} from "./project_test";

import { commands } from "vscode";

/**
 * This class represents a HDL project with its sources, tests and anything related to it.
 * In particular, this holds the source tree of a given project and the top level file.
 
 * @remarks
 *
 * Multiple projects should be able to coexist at the same time.
 * Preferably one project should be "active" at a given time, but keep in mind the capability to have
 * multiple projects at the same time. 
 * 
 * A 'project' informations should be passed to the LSP in order to get its features enabled.
 *
 * @alpha
 */
class HDLProject {

    // !Static Methods

    // !Private (and/or readonly) Properties
    /** Name of the project */
    public name : string = "Unnamed" ;
    
    /** Indicate that the project is set active by the user */
    protected _isActive : boolean = false;
    /** Indicate that the project is deemed valid (properly constructed) */
    protected _isValid : boolean = false;
    /** List of all source files in the project */
    protected _sourceList : string[] = [];
    /** Name of the top-level entity if any */
    protected _topLevel : string | null = null;


    /** List of all tests managers linked to the project */
    protected _testsHandlers : BaseProjectTests[] = [];


    // !Constructor Function
    constructor(){}

    // !Getters and Setters

    // !Public Instance Methods
    toJSON() : DiplomatProject {
        return this._forExchange();
    }

    /**
     * Send the whole project to the LSP (used for any update)
     */
    public sendToLSP() : void 
    {
        commands.executeCommand("diplomat-server.set-project",[this._forExchange()]);
    }

    // !Private Subroutines
    /**
     * @returns The representation of the current project in JSON
     * based upon the `DiplomatProject` exchange format
     */
    protected _forExchange() : DiplomatProject
    {
        return {
            topLevel: this._topLevel,
            name: this.name,
            sourceList: this._sourceList,
            active : this._isActive
        }
    }

}