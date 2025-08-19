import { DiplomatProject, HDLModule } from "../../exchange_types";
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
export class HDLProject {

    // !Static Methods

    // !Private (and/or readonly) Properties
    
    /** Indicate that the project is set active by the user */
    public isActive : boolean = false;
    /** Indicate that the project is deemed valid (properly constructed) */
    protected _isValid : boolean = false;
    /** List of all source files in the project */
    protected _sourceList : string[] = [];
    /** List of include directory */
    protected _includeDirs : string[] = [];
    /** Name of the top-level entity if any */
    protected _topLevel ?: HDLModule | null;


    /** List of all tests managers linked to the project */
    protected _testsHandlers : BaseProjectTests[] = [];


    // !Constructor Function
    constructor(public name : string = "Unnamed"){
    }

    public static fromDiplomatProject(prj : DiplomatProject) : HDLProject
    {
        let ret : HDLProject = new HDLProject(prj.name);
        ret.topLevel = prj.topLevel;
        ret.isActive = prj.active;
        ret._sourceList = prj.sourceList;
        ret._includeDirs = prj.includeDirs;

        return ret;
    }

    // !Getters and Setters
    
    public get sourceFiles() {
        return this._sourceList.values();
    }
    

    public set topLevel(top : HDLModule | null | undefined) {
        this._topLevel = top;
    }

    public setActive(newState : boolean)
    {
        this.isActive = newState;
    }
    // !Public Instance Methods
    toJSON() : DiplomatProject {
        return this._forSave();
    }

    /**
     * addFileToProject
     */
    public addFileToProject(filepath : string) 
    {
        if(! this._sourceList.includes(filepath))
            this._sourceList.push(filepath);
    }

    public removeFileFromProject(filepath : string)
    {
        this._sourceList = this._sourceList.filter((elt,_) =>  {return elt !== filepath});
    }

    // !Private Subroutines
    /**
     * @returns The representation of the current project in JSON
     * based upon the `DiplomatProject` exchange format
     */
    protected _forSave() : DiplomatProject
    {
        return {
            topLevel: this._topLevel,
            name: this.name,
            sourceList: this._sourceList,
            includeDirs : this._includeDirs,
            active : this.isActive
        }
    }

    protected _forLSP() : DiplomatProject
    {

        let ret : DiplomatProject = {
            topLevel: this._topLevel ? this._topLevel : undefined,
            name: this.name,
            sourceList: this._sourceList,
            includeDirs : this._includeDirs,
            active : this.isActive
        }



        return ret
    }

}