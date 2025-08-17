
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

import { window, commands, ExtensionContext, workspace, Uri, Range, Selection, DecorationOptions, LogOutputChannel } from 'vscode';
import { ExtensionEnvironment } from './features/base_feature';
import { FeatureDiplomatLSPClient } from './features/feat_lsp_client';
import { ContextVar } from './utils';
import { FeatureWaveformViewer } from './features/feat_waveform_viewer';



/**
 * This class is the glue for the whole extension, managing the boot
 * and exit procedures, building features and binding features events.
 */
export class DiplomatExtension {
    
    // Features
    protected _lsp_client : FeatureDiplomatLSPClient;
    protected _lsp_waveform : FeatureWaveformViewer;


    public constructor(protected _extension_environment : ExtensionEnvironment)
    {
        this._lsp_client = new FeatureDiplomatLSPClient(this._extension_environment);
        this._lsp_waveform = new FeatureWaveformViewer(this._extension_environment);
    }

    /**
     * start
     */
    public async start() {

        await this._lsp_client.start();
        commands.executeCommand('setContext', ContextVar.DiplomatEnabled , true);
    }
}