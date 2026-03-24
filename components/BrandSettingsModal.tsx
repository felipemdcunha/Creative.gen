import React, { useState, useEffect } from 'react';
import { CreativeSet } from '../types';
import { supabase } from '../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  creativeSet: CreativeSet;
  onUpdate: (updatedSet: CreativeSet) => void;
}

const BrandSettingsModal: React.FC<Props> = ({ isOpen, onClose, creativeSet, onUpdate }) => {
  const [colors, setColors] = useState({
    primary: '#000000',
    secondary: '#000000',
    tertiary: '#000000',
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (creativeSet) {
      if (creativeSet.brand_colors) {
        setColors({
          primary: creativeSet.brand_colors.primary || '#000000',
          secondary: creativeSet.brand_colors.secondary || '#000000',
          tertiary: creativeSet.brand_colors.tertiary || '#000000',
        });
      }
      setLogoUrl(creativeSet.additional_logo_url || null);
    }
  }, [creativeSet, isOpen]);

  const handleColorChange = (key: 'primary' | 'secondary' | 'tertiary', value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalLogoUrl = logoUrl;

      // 1. Upload Logo if selected
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${creativeSet.id}-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('brand-assets')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('brand-assets')
          .getPublicUrl(filePath);
          
        finalLogoUrl = data.publicUrl;
      }

      // 2. Update Database
      const updatedData = {
        brand_colors: colors,
        additional_logo_url: finalLogoUrl
      };

      const { data, error } = await supabase
        .from('creative_sets')
        .update(updatedData)
        .eq('id', creativeSet.id)
        .select()
        .single();

      if (error) throw error;

      onUpdate(data as CreativeSet);
      onClose();
    } catch (error) {
      console.error('Error saving brand settings:', error);
      alert('Erro ao salvar configurações da marca.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Identidade Visual da Campanha</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Colors */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Paleta de Cores</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={colors.primary} 
                  onChange={(e) => handleColorChange('primary', e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                />
                <div className="flex-1">
                  <label className="block text-xs text-gray-500">Cor Primária</label>
                  <input 
                    type="text" 
                    value={colors.primary} 
                    onChange={(e) => handleColorChange('primary', e.target.value)}
                    className="w-full text-sm border-b border-gray-200 focus:border-brand outline-none py-1"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={colors.secondary} 
                  onChange={(e) => handleColorChange('secondary', e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                />
                <div className="flex-1">
                  <label className="block text-xs text-gray-500">Cor Secundária</label>
                  <input 
                    type="text" 
                    value={colors.secondary} 
                    onChange={(e) => handleColorChange('secondary', e.target.value)}
                    className="w-full text-sm border-b border-gray-200 focus:border-brand outline-none py-1"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={colors.tertiary} 
                  onChange={(e) => handleColorChange('tertiary', e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                />
                <div className="flex-1">
                  <label className="block text-xs text-gray-500">Cor Terciária</label>
                  <input 
                    type="text" 
                    value={colors.tertiary} 
                    onChange={(e) => handleColorChange('tertiary', e.target.value)}
                    className="w-full text-sm border-b border-gray-200 focus:border-brand outline-none py-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Logo Upload */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Logo Adicional</h3>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition">
              {file ? (
                <div className="text-sm text-green-600 font-medium">{file.name}</div>
              ) : logoUrl ? (
                <div className="flex flex-col items-center">
                  <img src={logoUrl} alt="Logo Atual" className="h-12 object-contain mb-2" />
                  <span className="text-xs text-gray-400">Logo Atual</span>
                </div>
              ) : (
                <div className="text-sm text-gray-400">Nenhum logo configurado</div>
              )}
              
              <label className="mt-3 inline-block cursor-pointer">
                <span className="text-brand text-sm font-medium hover:underline">
                  {logoUrl || file ? 'Alterar Logo' : 'Fazer Upload'}
                </span>
                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-2">Formatos: PNG, JPG ou SVG (Fundo transparente recomendado).</p>
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3 rounded-b-xl">
          <button onClick={onClose} disabled={saving} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="px-5 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-lg shadow-lg transform transition active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center"
          >
            {saving ? (
               <>
                 <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 Salvando...
               </>
            ) : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BrandSettingsModal;