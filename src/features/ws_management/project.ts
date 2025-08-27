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
export class HDLProject implements DiplomatProject{

    // !Static Methods

    // !Private (and/or readonly) Properties
    
    /** Indicate that the project is set active by the user */
    public active : boolean = false;
    /** List of all source files in the project */
    public sourceList : string[] = [];
    /** List of include directory */
    public includeDirs : string[] = [];
    /** Name of the top-level entity if any */
    public topLevel ?: HDLModule | null;


    /** List of all tests managers linked to the project */
    // protected _testsHandlers : BaseProjectTests[] = [];


    // !Constructor Function
    constructor(public name : string = "Unnamed"){
    }

    public static fromDiplomatProject(prj : DiplomatProject) : HDLProject
    {
        let ret : HDLProject = new HDLProject();
        Object.assign(ret,prj);
        
        return ret;
    }

    // !Getters and Setters
    
    public get sourceFiles() {
        return this.sourceList.values();
    }
    

    public setActive(newState : boolean)
    {
        this.active = newState;
    }
    // !Public Instance Methods
    toJSON() : DiplomatProject {
        return this as DiplomatProject;
    }

    /**
     * addFileToProject
     */
    public addFileToProject(filepath : string ) 
    {
        if(! this.sourceList.includes(filepath))
            this.sourceList.push(filepath);
    }

    public removeFileFromProject(filepath : string)
    {
        this.sourceList = this.sourceList.filter((elt,_) =>  {return elt !== filepath});
    }

    // !Private Subroutines
    /**
     * @returns The representation of the current project in JSON
     * based upon the `DiplomatProject` exchange format
     */
    protected _forSave() : DiplomatProject
    {
        return {
            topLevel: this.topLevel,
            name: this.name,
            sourceList: this.sourceList,
            includeDirs : this.includeDirs,
            active : this.active
        }
    }

    protected _forLSP() : DiplomatProject
    {

        let ret : DiplomatProject = {
            topLevel: this.topLevel ? this.topLevel : undefined,
            name: this.name,
            sourceList: this.sourceList,
            includeDirs : this.includeDirs,
            active : this.active
        }



        return ret
    }

}