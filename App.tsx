import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { CreativeSet, Persona } from './types';
import PersonaDashboard from './components/PersonaDashboard';
import BrandSettingsModal from './components/BrandSettingsModal';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  
  // Navigation State
  const [view, setView] = useState<'sets' | 'personas' | 'dashboard'>('sets');
  const [selectedSet, setSelectedSet] = useState<CreativeSet | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  // Data State
  const [sets, setSets] = useState<CreativeSet[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        setHasApiKey(true); // Fallback if not in AI Studio environment
      }
    };
    checkApiKey();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session) fetchSets();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchSets();
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchSets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch profile using email as the unique identifier since user_id column is not explicitly present in profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('email', user.email)
        .single();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        return;
      }
      
      if (!profile?.organization_id) {
        console.warn("User has no organization_id linked.");
        return;
      }

      const { data, error } = await supabase
        .from('creative_sets')
        .select('*')
        .eq('organization_id', profile.organization_id);

      if (error) throw error;
      
      if (data) {
        setSets(data);
      }
    } catch (err) {
      console.error("Error fetching sets:", err);
    }
  };

  const fetchPersonas = async (setId: string) => {
    const { data, error } = await supabase.from('personas').select('*').eq('creative_set_id', setId);
    if (!error && data) {
      setPersonas(data);
    }
  };

  const handleSetClick = async (set: CreativeSet) => {
    setSelectedSet(set);
    await fetchPersonas(set.id);
    setView('personas');
  };

  const handlePersonaClick = (persona: Persona) => {
    setSelectedPersona(persona);
    setView('dashboard');
  };

  const handleBrandUpdate = (updatedSet: CreativeSet) => {
    setSelectedSet(updatedSet);
    // Also update the list to reflect changes if the user goes back
    setSets(prev => prev.map(s => s.id === updatedSet.id ? updatedSet : s));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      // Auth state listener will handle session update
    } catch (err: any) {
      setLoginError(err.message || "Erro ao fazer login. Verifique suas credenciais.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true); // Assume success as per instructions
    }
  };

  if (loading || hasApiKey === null) return <div className="h-screen flex items-center justify-center text-brand">Carregando...</div>;

  if (hasApiKey === false) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-center">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
          <div className="w-16 h-16 bg-brand/10 text-brand rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Configuração Necessária</h2>
          <p className="text-gray-600 mb-8">
            Para gerar imagens de alta qualidade, você precisa selecionar uma chave de API do Google Cloud com faturamento ativado.
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-brand hover:bg-brand-hover text-white font-semibold py-3 rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2"
          >
            Selecionar Chave de API
          </button>
          <p className="mt-6 text-xs text-gray-400">
            Consulte a <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">documentação de faturamento</a> para mais detalhes.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
           <div className="text-center mb-8">
             <h2 className="text-2xl font-bold text-slate-800">Beupse Intelligence</h2>
             <p className="text-gray-500 text-sm mt-1">Gerador de Criativos</p>
           </div>
           
           <form onSubmit={handleLogin} className="space-y-5">
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
               <input 
                 type="email" 
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition text-sm"
                 placeholder="seu@email.com"
                 required
               />
             </div>
             
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
               <input 
                 type="password" 
                 value={password}
                 onChange={(e) => setPassword(e.target.value)}
                 className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition text-sm"
                 placeholder="••••••••"
                 required
               />
             </div>

             {loginError && (
               <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-3 rounded-lg">
                 {loginError}
               </div>
             )}

             <button 
               type="submit" 
               disabled={loggingIn}
               className="w-full bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded-lg shadow-md hover:shadow-lg transform transition active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
             >
               {loggingIn ? (
                 <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
               ) : (
                 "Entrar"
               )}
             </button>
           </form>
           
           <div className="mt-6 text-center">
             <p className="text-xs text-gray-400">
               Acesso restrito a usuários autorizados.
             </p>
           </div>
        </div>
      </div>
    );
  }

  // --- Views ---

  if (view === 'dashboard' && selectedSet && selectedPersona) {
    return (
      <PersonaDashboard 
        creativeSet={selectedSet} 
        persona={selectedPersona} 
        onBack={() => setView('personas')} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <header className="mb-8 max-w-7xl mx-auto flex justify-between items-center">
         <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {view === 'sets' ? 'Meus Conjuntos' : `Personas: ${selectedSet?.name}`}
            </h1>
            <p className="text-gray-500">
              {view === 'sets' ? 'Gerencie suas campanhas e personas imobiliárias' : 'Selecione uma persona para gerar criativos'}
            </p>
         </div>
         <div className="flex items-center gap-4">
           {view === 'personas' && (
             <>
               <button 
                 onClick={() => setIsBrandModalOpen(true)}
                 className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition shadow-sm"
               >
                 <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                 Identidade Visual
               </button>
               <button onClick={() => setView('sets')} className="text-gray-500 hover:text-brand transition flex items-center gap-1">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                 Voltar
               </button>
             </>
           )}
           <button 
             onClick={() => supabase.auth.signOut()} 
             className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-3 py-1.5 transition"
           >
             Sair
           </button>
         </div>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {view === 'sets' && sets.map((set) => (
          <div 
            key={set.id} 
            onClick={() => handleSetClick(set)}
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-transparent hover:border-brand group"
          >
            <div className="h-32 bg-gray-100 rounded-lg mb-4 flex items-center justify-center text-gray-400">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            <h3 className="font-bold text-lg group-hover:text-brand">{set.name}</h3>
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{set.market_vocation}</p>
          </div>
        ))}

        {view === 'personas' && personas.map((persona) => (
          <div 
            key={persona.id} 
            onClick={() => handlePersonaClick(persona)}
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-transparent hover:border-brand group"
          >
            <div className="flex items-center gap-4 mb-4">
               <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden">
                   <img src={persona.avatar_url || `https://ui-avatars.com/api/?name=${persona.name}&background=random`} alt={persona.name} className="w-full h-full object-cover" />
               </div>
               <h3 className="font-bold group-hover:text-brand leading-tight">{persona.name}</h3>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
               <p><strong className="text-gray-900">Arquétipo:</strong> {persona.advanced_data.archetype}</p>
               <p className="line-clamp-2"><strong className="text-gray-900">Dor:</strong> {persona.advanced_data.pain_points}</p>
            </div>
          </div>
        ))}
      </div>
      
      {((view === 'sets' && sets.length === 0) || (view === 'personas' && personas.length === 0)) && (
          <div className="text-center py-20">
              <p className="text-gray-400">Nenhum registro encontrado.</p>
          </div>
      )}

      {selectedSet && (
        <BrandSettingsModal 
          isOpen={isBrandModalOpen}
          onClose={() => setIsBrandModalOpen(false)}
          creativeSet={selectedSet}
          onUpdate={handleBrandUpdate}
        />
      )}
    </div>
  );
};

export default App;