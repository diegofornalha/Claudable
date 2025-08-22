'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  const [ClaudableTerminal, setClaudableTerminal] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Carrega o componente ClaudableTerminal dinamicamente apenas no cliente
    import('../../components/ClaudableTerminal').then((mod) => {
      setClaudableTerminal(() => mod.default);
    });
  }, []);

  const handleAuthenticated = () => {
    setIsAuthenticated(true);
    // Redireciona para a página principal após autenticação
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-[#DE7356] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
            🚀 Claudable
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Autentique-se com Claude CLI para começar
          </p>
        </div>

        {/* Terminal Container */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              🔐 Autenticação Claude CLI
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Use o terminal abaixo para fazer login no Claude sem necessidade de API key.
              Execute <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">claude login</code> para começar.
            </p>
          </div>

          {ClaudableTerminal ? (
            <ClaudableTerminal 
              projectId="global"
              onAuthenticated={handleAuthenticated}
            />
          ) : (
            <div className="bg-gray-900 rounded-lg p-8 text-center">
              <div className="w-6 h-6 border-2 border-[#DE7356] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-400">Carregando terminal...</p>
            </div>
          )}

          {isAuthenticated && (
            <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="text-green-500 dark:text-green-400">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Autenticação realizada com sucesso!
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    Redirecionando para o dashboard...
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
            <p>
              Não tem o Claude CLI instalado?
            </p>
            <p>
              Execute: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">npm install -g @anthropic-ai/claude-code</code>
            </p>
          </div>
          
          <div className="mt-6">
            <Link 
              href="/"
              className="text-sm text-[#DE7356] hover:text-[#c95940] transition-colors"
            >
              ← Voltar para o dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}