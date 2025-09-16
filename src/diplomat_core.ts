
 /*
 * Diplomat for Visual Studio Code is a language server protocol client for Diplomat language server.
 * Copyright (C) 2025  Julien FAUCHER
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { commands} from 'vscode';
import { ExtensionEnvironment } from './features/base_feature';
import { FeatureDiplomatLSPClient } from './features/feat_lsp_client';
import { ContextVar, get_workspace_base_uri } from './utils';
import { FeatureWaveformViewer } from './features/feat_waveform_viewer';
import { FeatureProjectManagement } from './features/feat_prj_management';
import { FeatureEditor } from './features/feat_editor';
import { FeatureHierarchyManagement } from './features/feat_hierarchy';
import { FeatureTestController } from './features/feat_test_controller';



/**
 * This class is the glue for the whole extension, managing the boot
 * and exit procedures, building features and binding features events.
 */
export class DiplomatExtension {
    
    // Features
    protected _feat_lsp : FeatureDiplomatLSPClient;
    protected _feat_waveform : FeatureWaveformViewer;
    protected _feat_project : FeatureProjectManagement;
    protected _feat_editor: FeatureEditor;
    protected _feat_hier: FeatureHierarchyManagement;
    protected _feat_test: FeatureTestController;

    readonly logger = this._extension_environment.logger;

    public constructor(protected _extension_environment : ExtensionEnvironment)
    {
        this._feat_lsp = new FeatureDiplomatLSPClient(this._extension_environment);
        this._feat_waveform = new FeatureWaveformViewer(this._extension_environment);
        this._feat_project = new FeatureProjectManagement(this._extension_environment);
        this._feat_editor = new FeatureEditor(this._extension_environment);
        this._feat_hier = new FeatureHierarchyManagement(this._extension_environment);
        this._feat_test = new FeatureTestController(this._extension_environment);

        this._bind_events();
    }


    protected _bind_events()
    {
        this._feat_hier.on_elt_select(this._feat_waveform.set_design_location, this._feat_waveform);

        this._feat_project.on_config_loaded(this._feat_hier.refresh,this._feat_hier);

        this._feat_test.on_test_finished(this._feat_waveform.refresh_waves, this._feat_waveform);
    }

    /**
     * start
     */
    public async start() {

        await this._feat_lsp.start();
        await this._feat_project.start();
        commands.executeCommand('setContext', ContextVar.DiplomatEnabled, true);
        this.logger?.info(`Diplomat started in workspace ${get_workspace_base_uri()?.fsPath}`);
    }

    public stop()
    {
        this.logger?.info("Diplomat is being disabled. Bye !");
        commands.executeCommand("setContext", ContextVar.DiplomatEnabled, false);
    }

    public dispose()
    {
        this.stop();
    }

}