// ==========================================
// 1. IMPORTAÇÕES DO FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, updatePassword, EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ⚠️ SUBSTITUA PELAS SUAS CREDENCIAIS REAIS DO FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyAbgF4rh9O4XMLJew2aWDzJoFR_oD-JtVY",
  authDomain: "ascdigital.firebaseapp.com",
  projectId: "ascdigital",
  storageBucket: "ascdigital.firebasestorage.app",
  messagingSenderId: "163815134757",
  appId: "1:163815134757:web:588521c177bf5baabd51cc",
  measurementId: "G-WFV14J0JF3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ==========================================
// 2. ESTADO GLOBAL DA APLICAÇÃO
// ==========================================
let appData = {
  clientes: [],
  equipamentos: [],
  ordens: [],
  usuarios: [],
  dadosEmpresa: {}
};
let currentUser = null;
let editingOS = null;
let appLogs = [];

// ==========================================
// 3. FUNÇÕES AUXILIARES DE BANCO DE DADOS
// ==========================================
async function saveDocument(collName, data, docId = null) {
  if (docId) {
    const ref = doc(db, collName, docId);
    await updateDoc(ref, data);
    return docId;
  } else {
    const ref = await addDoc(collection(db, collName), data);
    return ref.id;
  }
}

async function deleteDocument(collName, docId) {
  const ref = doc(db, collName, docId);
  await deleteDoc(ref);
}

function escapeHTML(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function loadAllData() {
  try {
    const userSnap = await getDocs(collection(db, "usuarios"));
    appData.usuarios = userSnap.docs.map(d => {
      const data = d.data();
      delete data.senha;
      return { id: d.id, ...data };
    });

    if (appData.usuarios.length === 0) {
      const defaultAdmin = { 
        nome: 'Administrador', 
        login: 'ratao.288@gmail.com', 
        tipo: 'admin', 
        status: 'ativo' 
      };
      const newId = await saveDocument('usuarios', defaultAdmin);
      appData.usuarios.push({ id: newId, ...defaultAdmin });
    }

    const clientesSnap = await getDocs(collection(db, "clientes"));
    appData.clientes = clientesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const equipamentosSnap = await getDocs(collection(db, "equipamentos"));
    appData.equipamentos = equipamentosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const ordensSnap = await getDocs(collection(db, "ordens"));
    appData.ordens = ordensSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const empresaSnap = await getDocs(collection(db, "dadosEmpresa"));
    if (!empresaSnap.empty) {
      appData.dadosEmpresa = empresaSnap.docs[0].data();
      appData.dadosEmpresa.id = empresaSnap.docs[0].id;
    } else {
      appData.dadosEmpresa = {
        nome: 'ASC Digital',
        cnpj: '',
        endereco: 'ASC Digital - Soluções Tecnológicas',
        telefone: '(11) 96400-9152',
        email: 'contato@ascdigital.com.br'
      };
      const newId = await saveDocument('dadosEmpresa', appData.dadosEmpresa);
      appData.dadosEmpresa.id = newId;
    }
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    alert("Erro de conexão com o banco de dados. Verifique sua internet e as regras do Firestore.");
  }
}

async function registrarLog(acao, entidade, detalhes) {
  try {
    if (!currentUser) return;
    
    const log = {
      usuarioId: currentUser.id,
      usuarioNome: currentUser.nome,
      usuarioLogin: currentUser.login,
      acao: acao,
      entidade: entidade,
      detalhes: detalhes,
      timestamp: Date.now()
    };
    
    await saveDocument('logs', log);
  } catch (error) {
    console.error("Erro ao registrar log:", error);
  }
}

// ==========================================
// 4. INICIALIZAÇÃO E AUTENTICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
  updateDate();
  setupMasks();
  setupLogin();
  const now = new Date();
  document.getElementById('faturamentoMes').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
});

function updateDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('currentDate').textContent = now.toLocaleDateString('pt-BR', options);
}

function setupLogin() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await loadAllData();
      const found = appData.usuarios.find(u => u.login === user.email && u.status === 'ativo');
      
      if (found) {
        currentUser = found;
        currentUser.uid = user.uid;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainSystem').style.display = 'flex';
        document.getElementById('currentUserName').textContent = found.nome;
        document.getElementById('currentUserRole').textContent = found.tipo === 'admin' ? 'Administrador' : 'Usuário';
        
        if (found.tipo !== 'admin') { 
          document.getElementById('adminSection').style.display = 'none'; 
        }
        updateDashboard();
      } else {
        alert("Usuário não encontrado ou inativo.");
        await signOut(auth);
      }
    } else {
      currentUser = null;
      document.getElementById('mainSystem').style.display = 'none';
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('adminSection').style.display = 'block';
    }
  });

  document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    let loginInput = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    
    try {
      let emailParaLogin = loginInput;
      if (!loginInput.includes('@')) {
        const usuario = appData.usuarios.find(u => u.login === loginInput && u.status === 'ativo');
        if (!usuario) throw new Error('Usuário não encontrado');
        emailParaLogin = usuario.login;
        if (!emailParaLogin || !emailParaLogin.includes('@')) throw new Error('Usuário não tem email válido');
      }
      await signInWithEmailAndPassword(auth, emailParaLogin, password);
      await registrarLog('LOGIN', 'SISTEMA', `Usuário ${emailParaLogin} entrou no sistema`);
    } catch (error) {
      console.error("Erro no login:", error);
      const errorEl = document.getElementById('loginError');
      errorEl.querySelector('span').textContent = "Email ou senha incorretos.";
      errorEl.style.display = 'flex';
      setTimeout(() => { errorEl.style.display = 'none'; }, 3000);
    }
  });
}

function togglePassword() {
  const passInput = document.getElementById('loginPass');
  passInput.type = passInput.type === 'password' ? 'text' : 'password';
}

async function logout() {
  if (currentUser) {
    await registrarLog('LOGOUT', 'SISTEMA', `Usuário ${currentUser.nome} saiu do sistema`);
  }
  try { await signOut(auth); } catch (error) { console.error("Erro ao fazer logout:", error); }
}

function showForgotPassword() {
  alert('Entre em contato com o administrador do sistema para recuperar sua senha.');
}

// ==========================================
// 5. ALTERAR SENHA
// ==========================================
function openAlterarSenhaModal() {
  document.getElementById('alterarSenhaForm').reset();
  openModal('alterarSenhaModal');
  document.getElementById('senhaAtual').focus();
}

async function alterarSenha(e) {
  e.preventDefault();
  const senhaAtual = document.getElementById('senhaAtual').value;
  const novaSenha = document.getElementById('novaSenha').value;
  const confirmarSenha = document.getElementById('confirmarSenha').value;

  if (novaSenha !== confirmarSenha) { alert('A confirmação da nova senha não confere.'); return; }
  if (novaSenha.length < 6) { alert('A nova senha deve ter pelo menos 6 caracteres.'); return; }

  try {
    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, senhaAtual);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, novaSenha);
    await registrarLog('ALTERAR_SENHA', 'SISTEMA', `Usuário alterou sua própria senha`);
    closeModal('alterarSenhaModal');
    alert('✅ Senha alterada com sucesso!');
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      alert('❌ A senha atual está incorreta.');
    } else {
      alert("❌ Erro ao alterar senha: " + error.message);
    }
  }
}

// ==========================================
// 6. NAVEGAÇÃO E MODAIS
// ==========================================
function showSection(section, event) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`section-${section}`).classList.add('active');
  
  if (event && event.target) {
    const navItem = event.target.closest('.nav-item');
    if (navItem) navItem.classList.add('active');
  }

  const titles = {
    'dashboard': 'Painel de Controle', 'clientes': 'Clientes', 'equipamentos': 'Equipamentos',
    'ordens': 'Ordens de Serviço', 'faturamento': 'Faturamento', 'importar': 'Importar Planilha',
    'exportar': 'Relatórios e Exportações', 'backup': 'Backup e Restauração',
    'usuarios': 'Usuários do Sistema', 'dadosEmpresa': 'Dados da Empresa',
    'logs': 'Logs do Sistema'
  };
  document.getElementById('pageTitle').textContent = titles[section] || 'Painel de Controle';

  if (section === 'clientes') loadClientes();
  if (section === 'equipamentos') loadEquipamentos();
  if (section === 'ordens') loadOrdens();
  if (section === 'faturamento') updateFaturamento();
  if (section === 'usuarios') loadUsuarios();
  if (section === 'dadosEmpresa') loadDadosEmpresa();
  if (section === 'logs') loadLogs();
}

function toggleSidebar() { document.querySelector('.sidebar').classList.toggle('collapsed'); }

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
  if (modalId === 'osModal' && !editingOS) {
    const nextNum = appData.ordens.length + 1;
    document.getElementById('osNumero').value = `OS-${String(nextNum).padStart(4, '0')}`;
    document.getElementById('osDataEntrada').value = new Date().toISOString().split('T')[0];
    loadClientesSelect('osCliente');
    document.getElementById('servicosBody').innerHTML = '';
    updateOSTotals();
  }
  if (modalId === 'equipamentoModal') loadClientesSelect('equipamentoCliente');
  if (modalId === 'clienteModal') toggleTipoCliente();
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
  if (modalId === 'osModal') { editingOS = null; document.getElementById('osForm').reset(); document.getElementById('osId').value = ''; }
  if (modalId === 'clienteModal') { 
    document.getElementById('clienteForm').reset(); 
    document.getElementById('clienteId').value = ''; 
    document.getElementById('clienteModalTitle').textContent = 'Novo Cliente'; 
    document.getElementById('clienteTipo').value = 'PF';
    toggleTipoCliente();
  }
  if (modalId === 'equipamentoModal') { 
    document.getElementById('equipamentoForm').reset(); 
    document.getElementById('equipamentoId').value = ''; 
    document.getElementById('equipamentoModalTitle').textContent = 'Novo Equipamento'; 
  }
  if (modalId === 'usuarioModal') { document.getElementById('usuarioForm').reset(); document.getElementById('usuarioId').value = ''; document.getElementById('usuarioModalTitle').textContent = 'Novo Usuário'; }
}

function toggleBusca(tipo) {
  let painel = document.getElementById(`${tipo}SearchPanel`);
  const campoId = `${tipo}Search`;
  if (!painel) {
    const section = document.getElementById(`section-${tipo}`);
    painel = document.createElement('div');
    painel.id = `${tipo}SearchPanel`;
    painel.className = 'search-panel';
    painel.innerHTML = `<i class="fas fa-search"></i><input type="search" id="${campoId}">`;
    const campoCriado = painel.querySelector('input');
    campoCriado.placeholder = tipo === 'clientes' ? 'Pesquisar por nome, CPF/CNPJ, telefone ou e-mail' : 'Pesquisar por nº série, tipo, marca ou cliente';
    campoCriado.addEventListener('input', tipo === 'clientes' ? loadClientes : loadEquipamentos);
    section.querySelector('.table-container').before(painel);
  }
  const campo = document.getElementById(campoId);
  const estaAberto = painel.classList.toggle('active');
  if (estaAberto) { campo.focus(); } 
  else { campo.value = ''; tipo === 'clientes' ? loadClientes() : loadEquipamentos(); }
}

// Toggle Tipo de Cliente (PF/PJ)
function toggleTipoCliente() {
  const tipo = document.getElementById('clienteTipo').value;
  const isPF = tipo === 'PF';
  
  document.getElementById('grupoNomeCliente').style.display = isPF ? 'block' : 'none';
  document.getElementById('grupoCpfCliente').style.display = isPF ? 'block' : 'none';
  document.getElementById('grupoRazaoSocial').style.display = isPF ? 'none' : 'block';
  document.getElementById('grupoNomeFantasia').style.display = isPF ? 'none' : 'block';
  document.getElementById('grupoCnpjCliente').style.display = isPF ? 'none' : 'block';
  document.getElementById('grupoIE').style.display = isPF ? 'none' : 'block';
  
    // Apenas Nome (PF) e Razão Social (PJ) continuam obrigatórios
  document.getElementById('clienteNome').required = isPF;
  document.getElementById('clienteRazaoSocial').required = !isPF;
}

// ==========================================
// 7. CRUD CLIENTES
// ==========================================
function loadClientes() {
  const tbody = document.getElementById('clientesTable');
  const termo = normalizarConsulta(document.getElementById('clientesSearch')?.value || '');
  tbody.innerHTML = '';

  appData.clientes.filter(c => {
    const documento = c.tipo === 'PJ' ? c.cnpj : c.cpf;
    const nomeExibicao = c.tipo === 'PJ' ? (c.razaoSocial || c.nomeFantasia) : c.nome;
    return !termo || normalizarConsulta(`${nomeExibicao} ${documento} ${c.telefone} ${c.email || ''}`).includes(termo);
  }).forEach(c => {
    const documento = c.tipo === 'PJ' ? c.cnpj : c.cpf;
    const nomeExibicao = c.tipo === 'PJ' ? (c.razaoSocial || c.nomeFantasia || '-') : c.nome;
    const tipoLabel = c.tipo === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(nomeExibicao)}</td>
      <td>${escapeHTML(documento)}</td>
      <td>${escapeHTML(c.telefone)}</td>
      <td>${escapeHTML(c.email || '-')}</td>
      <td><span class="status-badge status-${c.tipo === 'PJ' ? 'andamento' : 'concluida'}">${tipoLabel}</span></td>
      <td>
        <button class="btn-icon edit" onclick="editCliente('${escapeHTML(c.id)}')"><i class="fas fa-edit"></i></button>
        ${currentUser.tipo === 'admin' ? `<button class="btn-icon delete" onclick="deleteCliente('${escapeHTML(c.id)}')"><i class="fas fa-trash"></i></button>` : ''}
      </td>`;
    tbody.appendChild(tr);
  });
}

async function saveCliente(e) {
  e.preventDefault();
  const id = document.getElementById('clienteId').value;
  const tipo = document.getElementById('clienteTipo').value;
  const data = {
    tipo: tipo,
    nome: tipo === 'PF' ? document.getElementById('clienteNome').value : '',
    cpf: tipo === 'PF' ? document.getElementById('clienteCpf').value : '',
    razaoSocial: tipo === 'PJ' ? document.getElementById('clienteRazaoSocial').value : '',
    nomeFantasia: tipo === 'PJ' ? document.getElementById('clienteNomeFantasia').value : '',
    cnpj: tipo === 'PJ' ? document.getElementById('clienteCnpj').value : '',
    ie: tipo === 'PJ' ? document.getElementById('clienteIE').value : '',
    telefone: document.getElementById('clienteTelefone').value,
    email: document.getElementById('clienteEmail').value,
    endereco: document.getElementById('clienteEndereco').value
  };
  try {
    const newId = await saveDocument('clientes', data, id || undefined);
    if (id) {
      const idx = appData.clientes.findIndex(c => c.id === id);
      appData.clientes[idx] = { id, ...data };
    } else {
      appData.clientes.push({ id: newId, ...data });
    }
    const nomeCliente = tipo === 'PJ' ? data.razaoSocial : data.nome;
    const documento = tipo === 'PJ' ? data.cnpj : data.cpf;
    await registrarLog(id ? 'EDITAR' : 'CRIAR', 'CLIENTE', 
      `${id ? 'Cliente editado' : 'Novo cliente'}: ${nomeCliente} (${documento})`);
    closeModal('clienteModal'); loadClientes(); updateDashboard();
  } catch (error) {
    console.error("Erro ao salvar cliente:", error);
    alert("Erro ao salvar cliente. Verifique sua conexão.");
  }
}

function editCliente(id) {
  const c = appData.clientes.find(cl => cl.id === id);
  document.getElementById('clienteId').value = c.id;
  document.getElementById('clienteTipo').value = c.tipo || 'PF';
  toggleTipoCliente();
  
  document.getElementById('clienteNome').value = c.nome || '';
  document.getElementById('clienteCpf').value = c.cpf || '';
  document.getElementById('clienteRazaoSocial').value = c.razaoSocial || '';
  document.getElementById('clienteNomeFantasia').value = c.nomeFantasia || '';
  document.getElementById('clienteCnpj').value = c.cnpj || '';
  document.getElementById('clienteIE').value = c.ie || '';
  document.getElementById('clienteTelefone').value = c.telefone;
  document.getElementById('clienteEmail').value = c.email || '';
  document.getElementById('clienteEndereco').value = c.endereco || '';
  document.getElementById('clienteModalTitle').textContent = 'Editar Cliente';
  openModal('clienteModal');
}

async function deleteCliente(id) {
  if (confirm('Deseja realmente excluir este cliente?')) {
    try {
      const c = appData.clientes.find(cl => cl.id === id);
      await deleteDocument('clientes', id);
      appData.clientes = appData.clientes.filter(c => c.id !== id);
      const nomeCliente = c.tipo === 'PJ' ? c.razaoSocial : c.nome;
      await registrarLog('EXCLUIR', 'CLIENTE', `Cliente excluído: ${nomeCliente}`);
      loadClientes(); updateDashboard();
    } catch (error) {
      console.error("Erro ao excluir cliente:", error);
      alert("Erro ao excluir cliente.");
    }
  }
}

// ==========================================
// 8. CRUD EQUIPAMENTOS
// ==========================================
function loadEquipamentos() {
  const tbody = document.getElementById('equipamentosTable');
  const termo = normalizarConsulta(document.getElementById('equipamentosSearch')?.value || '');
  tbody.innerHTML = '';

  appData.equipamentos.filter(e => {
    const cliente = appData.clientes.find(c => c.id === e.clienteId);
    const nomeCliente = cliente ? (cliente.tipo === 'PJ' ? cliente.razaoSocial : cliente.nome) : '';
    return !termo || normalizarConsulta(`${e.numeroSerie} ${e.tipo} ${e.marca} ${e.modelo} ${e.ano || ''} ${e.cor || ''} ${nomeCliente}`).includes(termo);
  }).forEach(e => {
    const cliente = appData.clientes.find(c => c.id === e.clienteId);
    const nomeCliente = cliente ? (cliente.tipo === 'PJ' ? cliente.razaoSocial : cliente.nome) : '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(e.numeroSerie)}</td>
      <td>${escapeHTML(e.tipo)}</td>
      <td>${escapeHTML(e.marca)} ${escapeHTML(e.modelo)}</td>
      <td>${escapeHTML(e.ano || '-')}</td>
      <td>${escapeHTML(e.cor || '-')}</td>
      <td>${nomeCliente}</td>
      <td>
        <button class="btn-icon edit" onclick="editEquipamento('${escapeHTML(e.id)}')"><i class="fas fa-edit"></i></button>
        ${currentUser.tipo === 'admin' ? `<button class="btn-icon delete" onclick="deleteEquipamento('${escapeHTML(e.id)}')"><i class="fas fa-trash"></i></button>` : ''}
      </td>`;
    tbody.appendChild(tr);
  });
}

async function saveEquipamento(e) {
  e.preventDefault();
  const id = document.getElementById('equipamentoId').value;
  const data = {
    numeroSerie: document.getElementById('equipamentoNumeroSerie').value,
    tipo: document.getElementById('equipamentoTipo').value,
    marca: document.getElementById('equipamentoMarca').value,
    modelo: document.getElementById('equipamentoModelo').value,
    ano: document.getElementById('equipamentoAno').value,
    cor: document.getElementById('equipamentoCor').value,
    clienteId: document.getElementById('equipamentoCliente').value
  };
  try {
    const newId = await saveDocument('equipamentos', data, id || undefined);
    if (id) {
      const idx = appData.equipamentos.findIndex(e => e.id === id);
      appData.equipamentos[idx] = { id, ...data };
    } else {
      appData.equipamentos.push({ id: newId, ...data });
    }
    await registrarLog(id ? 'EDITAR' : 'CRIAR', 'EQUIPAMENTO', 
      `${id ? 'Equipamento editado' : 'Novo equipamento'}: ${data.numeroSerie} - ${data.marca} ${data.modelo}`);
    closeModal('equipamentoModal'); loadEquipamentos(); updateDashboard();
  } catch (error) {
    console.error("Erro ao salvar equipamento:", error);
    alert("Erro ao salvar equipamento.");
  }
}

function editEquipamento(id) {
  const e = appData.equipamentos.find(eq => eq.id === id);
  document.getElementById('equipamentoId').value = e.id;
  document.getElementById('equipamentoNumeroSerie').value = e.numeroSerie;
  document.getElementById('equipamentoTipo').value = e.tipo;
  document.getElementById('equipamentoMarca').value = e.marca;
  document.getElementById('equipamentoModelo').value = e.modelo;
  document.getElementById('equipamentoAno').value = e.ano || '';
  document.getElementById('equipamentoCor').value = e.cor || '';
  loadClientesSelect('equipamentoCliente');
  document.getElementById('equipamentoCliente').value = e.clienteId;
  document.getElementById('equipamentoModalTitle').textContent = 'Editar Equipamento';
  openModal('equipamentoModal');
}

async function deleteEquipamento(id) {
  if (confirm('Deseja realmente excluir este equipamento?')) {
    try {
      const e = appData.equipamentos.find(x => x.id === id);
      await deleteDocument('equipamentos', id);
      appData.equipamentos = appData.equipamentos.filter(e => e.id !== id);
      await registrarLog('EXCLUIR', 'EQUIPAMENTO', `Equipamento excluído: ${e.numeroSerie}`);
      loadEquipamentos(); updateDashboard();
    } catch (error) {
      console.error("Erro ao excluir equipamento:", error);
      alert("Erro ao excluir equipamento.");
    }
  }
}

function loadClientesSelect(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Selecione o cliente</option>';
  appData.clientes.forEach(c => {
    const nomeExibicao = c.tipo === 'PJ' ? (c.razaoSocial || c.nomeFantasia) : c.nome;
    select.innerHTML += `<option value="${escapeHTML(c.id)}">${escapeHTML(nomeExibicao)}</option>`;
  });
}

function loadEquipamentosByCliente() {
  const clienteId = document.getElementById('osCliente').value;
  const select = document.getElementById('osEquipamento');
  select.innerHTML = '<option value="">Selecione o equipamento</option>';
  if (clienteId) {
    appData.equipamentos.filter(e => e.clienteId === clienteId).forEach(e => {
      select.innerHTML += `<option value="${escapeHTML(e.id)}">${escapeHTML(e.numeroSerie)} - ${escapeHTML(e.marca)} ${escapeHTML(e.modelo)}</option>`;
    });
  }
}

// ==========================================
// 9. ORDENS DE SERVIÇO
// ==========================================
function openConsultaOS() {
  document.getElementById('consultaNumeroSerie').value = '';
  document.getElementById('consultaCliente').value = '';
  openModal('consultaOSModal');
  consultarOS();
  document.getElementById('consultaNumeroSerie').focus();
}

function normalizarConsulta(valor) {
  return (valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function consultarOS() {
  const numeroSerie = normalizarConsulta(document.getElementById('consultaNumeroSerie').value);
  const clienteNome = normalizarConsulta(document.getElementById('consultaCliente').value);
  const tbody = document.getElementById('consultaOSTable');
  const resumo = document.getElementById('consultaOSResumo');

  const resultados = appData.ordens.filter(o => {
    const cliente = appData.clientes.find(c => c.id === o.clienteId);
    const equipamento = appData.equipamentos.find(e => e.id === o.equipamentoId);
    const nomeCliente = cliente ? (cliente.tipo === 'PJ' ? cliente.razaoSocial : cliente.nome) : '';
    const correspondeNumeroSerie = !numeroSerie || normalizarConsulta(equipamento ? equipamento.numeroSerie : '').includes(numeroSerie);
    const correspondeCliente = !clienteNome || normalizarConsulta(nomeCliente).includes(clienteNome);
    return correspondeNumeroSerie && correspondeCliente;
  });

  resumo.textContent = resultados.length === 1 ? '1 ordem de serviço encontrada.' : `${resultados.length} ordens de serviço encontradas.`;
  tbody.innerHTML = '';
  
  resultados.forEach(o => {
    const cliente = appData.clientes.find(c => c.id === o.clienteId);
    const equipamento = appData.equipamentos.find(e => e.id === o.equipamentoId);
    const nomeCliente = cliente ? (cliente.tipo === 'PJ' ? cliente.razaoSocial : cliente.nome) : '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(o.numero)}</td>
      <td>${nomeCliente}</td>
      <td>${equipamento ? escapeHTML(equipamento.numeroSerie) : '-'}</td>
      <td><span class="status-badge status-${escapeHTML(o.status)}">${getStatusLabel(o.status)}</span></td>
      <td><button class="btn-icon view" title="Visualizar OS" onclick="visualizarOSDaConsulta('${escapeHTML(o.id)}')"><i class="fas fa-eye"></i></button></td>`;
    tbody.appendChild(tr);
  });
}

function limparConsultaOS() {
  document.getElementById('consultaNumeroSerie').value = '';
  document.getElementById('consultaCliente').value = '';
  consultarOS();
  document.getElementById('consultaNumeroSerie').focus();
}

function visualizarOSDaConsulta(id) {
  closeModal('consultaOSModal');
  viewOS(id);
}

function loadOrdens() {
  const tbody = document.getElementById('ordensTable');
  tbody.innerHTML = '';

  appData.ordens.forEach(o => {
    const cliente = appData.clientes.find(c => c.id === o.clienteId);
    const equipamento = appData.equipamentos.find(e => e.id === o.equipamentoId);
    const nomeCliente = cliente ? (cliente.tipo === 'PJ' ? cliente.razaoSocial : cliente.nome) : '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(o.numero)}</td>
      <td>${nomeCliente}</td>
      <td>${equipamento ? `${escapeHTML(equipamento.numeroSerie)} - ${escapeHTML(equipamento.marca)}` : '-'}</td>
      <td>${formatDate(o.dataEntrada)}</td>
      <td>${formatCurrency(o.valorTotal)}</td>
      <td><span class="status-badge status-${escapeHTML(o.status)}">${getStatusLabel(o.status)}</span></td>
      <td>
        <button class="btn-icon view" onclick="viewOS('${escapeHTML(o.id)}')"><i class="fas fa-eye"></i></button>
        <button class="btn-icon edit" onclick="editOS('${escapeHTML(o.id)}')"><i class="fas fa-edit"></i></button>
        ${currentUser.tipo === 'admin' ? `<button class="btn-icon delete" onclick="deleteOS('${escapeHTML(o.id)}')"><i class="fas fa-trash"></i></button>` : ''}
      </td>`;
    tbody.appendChild(tr);
  });
}

async function saveOS(e) {
  e.preventDefault();
  const id = document.getElementById('osId').value;
  const servicos = [];

  document.querySelectorAll('#servicosBody tr').forEach(row => {
    servicos.push({
      tipo: row.querySelector('.serv-tipo').value,
      descricao: row.querySelector('.serv-desc').value,
      qtdPecas: parseFloat(row.querySelector('.serv-qtd').value) || 0,
      valorPecaUnit: parseFloat(row.querySelector('.serv-valor-peca').value) || 0,
      valorPecas: parseFloat(row.querySelector('.serv-total-pecas').textContent.replace(/[R$\s.]/g, '').replace(',', '.')) || 0,
      maoObra: parseFloat(row.querySelector('.serv-mao-obra').value) || 0,
      subtotal: parseFloat(row.querySelector('.serv-subtotal').textContent.replace(/[R$\s.]/g, '').replace(',', '.')) || 0
    });
  });

  const totalPecas = servicos.reduce((sum, s) => sum + s.valorPecas, 0);
  const totalMaoObra = servicos.reduce((sum, s) => sum + s.maoObra, 0);

  const data = {
    numero: document.getElementById('osNumero').value, 
    dataEntrada: document.getElementById('osDataEntrada').value,
    dataPrevisao: document.getElementById('osDataPrevisao').value, 
    status: document.getElementById('osStatus').value,
    clienteId: document.getElementById('osCliente').value, 
    equipamentoId: document.getElementById('osEquipamento').value,
    descricao: document.getElementById('osDescricao').value, 
    servicos, totalPecas, totalMaoObra, valorTotal: totalPecas + totalMaoObra
  };

  try {
    const newId = await saveDocument('ordens', data, id || undefined);
    if (id) {
      const idx = appData.ordens.findIndex(o => o.id === id);
      appData.ordens[idx] = { id, ...data };
    } else {
      appData.ordens.push({ id: newId, ...data });
    }
    await registrarLog(id ? 'EDITAR' : 'CRIAR', 'OS', 
      `${id ? 'OS editada' : 'Nova OS'}: ${data.numero} - ${formatCurrency(data.valorTotal)}`);
    closeModal('osModal'); loadOrdens(); updateDashboard();
  } catch (error) {
    console.error("Erro ao salvar OS:", error);
    alert("Erro ao salvar ordem de serviço.");
  }
}

function editOS(id) {
  if (currentUser.tipo !== 'admin') { alert('Apenas administradores podem editar ordens de serviço.'); return; }
  editingOS = true;
  const o = appData.ordens.find(or => or.id === id);
  document.getElementById('osId').value = o.id;
  document.getElementById('osNumero').value = o.numero;
  document.getElementById('osDataEntrada').value = o.dataEntrada;
  document.getElementById('osDataPrevisao').value = o.dataPrevisao || '';
  document.getElementById('osStatus').value = o.status;
  document.getElementById('osDescricao').value = o.descricao || '';
  
  loadClientesSelect('osCliente');
  document.getElementById('osCliente').value = o.clienteId;
  loadEquipamentosByCliente();
  document.getElementById('osEquipamento').value = o.equipamentoId;
  
  document.getElementById('servicosBody').innerHTML = '';
  o.servicos.forEach(s => addServicoRow(s));
  updateOSTotals();
  
  document.getElementById('osModalTitle').textContent = 'Editar Ordem de Serviço';
  openModal('osModal');
}

async function deleteOS(id) {
  if (currentUser.tipo !== 'admin') { alert('Apenas administradores podem excluir ordens de serviço.'); return; }
  if (confirm('Deseja realmente excluir esta ordem de serviço?')) {
    try {
      const o = appData.ordens.find(x => x.id === id);
      await deleteDocument('ordens', id);
      appData.ordens = appData.ordens.filter(o => o.id !== id);
      await registrarLog('EXCLUIR', 'OS', `OS excluída: ${o.numero}`);
      loadOrdens(); updateDashboard();
    } catch (error) {
      console.error("Erro ao excluir OS:", error);
      alert("Erro ao excluir ordem de serviço.");
    }
  }
}

function viewOS(id) {
  const o = appData.ordens.find(or => or.id === id);
  const cliente = appData.clientes.find(c => c.id === o.clienteId);
  const equipamento = appData.equipamentos.find(e => e.id === o.equipamentoId);

  let servicosHTML = '';
  o.servicos.forEach((s, i) => {
    servicosHTML += `<tr>
      <td>${i + 1}</td>
      <td>${escapeHTML(s.tipo)}</td>
      <td>${escapeHTML(s.descricao)}</td>
      <td>${s.qtdPecas}</td>
      <td>${formatCurrency(s.valorPecaUnit)}</td>
      <td>${formatCurrency(s.valorPecas)}</td>
      <td>${formatCurrency(s.maoObra)}</td>
      <td>${formatCurrency(s.subtotal)}</td>
    </tr>`;
  });

  const nomeCliente = cliente ? (cliente.tipo === 'PJ' ? cliente.razaoSocial : cliente.nome) : '-';
  const documentoCliente = cliente ? (cliente.tipo === 'PJ' ? cliente.cnpj : cliente.cpf) : '-';
  const labelDocCliente = cliente && cliente.tipo === 'PJ' ? 'CNPJ' : 'CPF';

  document.getElementById('osPrintContent').innerHTML = `
    <div class="os-print-header">
      <h2>${escapeHTML(appData.dadosEmpresa.nome)}</h2>
      <p>${escapeHTML(appData.dadosEmpresa.endereco)}</p>
      <p>Tel: ${escapeHTML(appData.dadosEmpresa.telefone)} | Email: ${escapeHTML(appData.dadosEmpresa.email)}</p>
      <h3 style="margin-top: 15px;">ORDEM DE SERVIÇO Nº ${escapeHTML(o.numero)}</h3>
    </div>
    <div class="os-print-info">
      <div><label>Cliente</label><span>${escapeHTML(nomeCliente)}</span></div>
      <div><label>${labelDocCliente}</label><span>${escapeHTML(documentoCliente)}</span></div>
      <div><label>Equipamento</label><span>${equipamento ? `${escapeHTML(equipamento.numeroSerie)} - ${escapeHTML(equipamento.marca)} ${escapeHTML(equipamento.modelo)}` : '-'}</span></div>
      <div><label>Tipo / Ano / Cor</label><span>${equipamento ? `${escapeHTML(equipamento.tipo)} / ${escapeHTML(equipamento.ano || '-')} / ${escapeHTML(equipamento.cor || '-')}` : '-'}</span></div>
      <div><label>Data Entrada</label><span>${formatDate(o.dataEntrada)}</span></div>
      <div><label>Previsão</label><span>${o.dataPrevisao ? formatDate(o.dataPrevisao) : '-'}</span></div>
      <div><label>Status</label><span>${getStatusLabel(o.status)}</span></div>
      <div><label>Telefone Cliente</label><span>${cliente ? escapeHTML(cliente.telefone) : '-'}</span></div>
    </div>
    ${o.descricao ? `<div style="margin-bottom: 20px;"><label style="font-weight: 600;">Descrição do Problema / Serviço:</label><p>${escapeHTML(o.descricao)}</p></div>` : ''}
    <table class="os-print-table">
      <thead><tr><th>#</th><th>Serviço</th><th>Descrição</th><th>Qtd Horas</th><th>Valor Hora</th><th>Total de Horas</th><th>Valor dos Serviços</th><th>Subtotal</th></tr></thead>
      <tbody>${servicosHTML}</tbody>
    </table>
    <div class="os-print-total">
      <div class="total-row"><span>Total de Horas:</span><span>${formatCurrency(o.totalPecas)}</span></div>
      <div class="total-row"><span>Valor dos Serviços:</span><span>${formatCurrency(o.totalMaoObra)}</span></div>
      <div class="total-row total-final"><span>VALOR TOTAL:</span><span>${formatCurrency(o.valorTotal)}</span></div>
    </div>
    <div style="margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px; text-align: center;">
      <div><div style="border-top: 1px solid #333; padding-top: 10px;"><p>Assinatura do Cliente</p></div></div>
      <div><div style="border-top: 1px solid #333; padding-top: 10px;"><p>Assinatura do Responsável</p></div></div>
    </div>`;
  openModal('osViewModal');
}

function printOS() { window.print(); }

function addServicoRow(data = null) {
  const tbody = document.getElementById('servicosBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="serv-tipo" placeholder="Tipo de serviço" value="${data ? escapeHTML(data.tipo) : ''}"></td>
    <td><input type="text" class="serv-desc" placeholder="Descrição" value="${data ? escapeHTML(data.descricao) : ''}"></td>
    <td><input type="number" class="serv-qtd" placeholder="0" min="0" step="1" value="${data ? data.qtdPecas : ''}" onchange="calcServicoRow(this)"></td>
    <td><input type="number" class="serv-valor-peca" placeholder="0,00" min="0" step="0.01" value="${data ? data.valorPecaUnit : ''}" onchange="calcServicoRow(this)"></td>
    <td class="serv-total-pecas">${data ? formatCurrency(data.valorPecas) : 'R$ 0,00'}</td>
    <td><input type="number" class="serv-mao-obra" placeholder="0,00" min="0" step="0.01" value="${data ? data.maoObra : ''}" onchange="calcServicoRow(this)"></td>
    <td class="serv-subtotal">${data ? formatCurrency(data.subtotal) : 'R$ 0,00'}</td>
    <td><button type="button" class="btn-icon delete" onclick="this.closest('tr').remove(); updateOSTotals();"><i class="fas fa-times"></i></button></td>`;
  tbody.appendChild(tr);
}

function calcServicoRow(input) {
  const row = input.closest('tr');
  const qtd = parseFloat(row.querySelector('.serv-qtd').value) || 0;
  const valorPeca = parseFloat(row.querySelector('.serv-valor-peca').value) || 0;
  const maoObra = parseFloat(row.querySelector('.serv-mao-obra').value) || 0;
  const totalPecas = qtd * valorPeca;
  row.querySelector('.serv-total-pecas').textContent = formatCurrency(totalPecas);
  row.querySelector('.serv-subtotal').textContent = formatCurrency(totalPecas + maoObra);
  updateOSTotals();
}

function updateOSTotals() {
  let totalPecas = 0, totalMaoObra = 0;
  document.querySelectorAll('#servicosBody tr').forEach(row => {
    totalPecas += (parseFloat(row.querySelector('.serv-qtd').value) || 0) * (parseFloat(row.querySelector('.serv-valor-peca').value) || 0);
    totalMaoObra += parseFloat(row.querySelector('.serv-mao-obra').value) || 0;
  });
  document.getElementById('osTotalPecas').textContent = formatCurrency(totalPecas);
  document.getElementById('osTotalMaoObra').textContent = formatCurrency(totalMaoObra);
  document.getElementById('osTotalGeral').textContent = formatCurrency(totalPecas + totalMaoObra);
}

// ==========================================
// 10. USUÁRIOS
// ==========================================
function loadUsuarios() {
  const tbody = document.getElementById('usuariosTable');
  tbody.innerHTML = '';

  appData.usuarios.forEach(u => {
    const tr = document.createElement('tr');
    const podeExcluir = currentUser.tipo === 'admin' && u.id !== currentUser.id;
    
    tr.innerHTML = `
      <td>${escapeHTML(u.nome)}</td>
      <td>${escapeHTML(u.login)}</td>
      <td>${u.tipo === 'admin' ? 'Administrador' : 'Usuário'}</td>
      <td><span class="status-badge status-${u.status === 'ativo' ? 'concluida' : 'cancelada'}">${escapeHTML(u.status)}</span></td>
      <td>
        <button class="btn-icon edit" onclick="editUsuario('${escapeHTML(u.id)}')"><i class="fas fa-edit"></i></button>
        ${podeExcluir ? `<button class="btn-icon delete" onclick="deleteUsuario('${escapeHTML(u.id)}')"><i class="fas fa-trash"></i></button>` : ''}
      </td>`;
    tbody.appendChild(tr);
  });
}

async function saveUsuario(e) {
  e.preventDefault();
  const id = document.getElementById('usuarioId').value;
  const nome = document.getElementById('usuarioNome').value;
  const login = document.getElementById('usuarioLogin').value;
  const senha = document.getElementById('usuarioSenha').value;
  const tipo = document.getElementById('usuarioTipo').value;
  const status = document.getElementById('usuarioStatus').value;

  try {
    let uid = null;
    if (!id && senha) {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, login, senha);
        uid = userCredential.user.uid;
      } catch (authError) {
        if (authError.code === 'auth/email-already-in-use') {
          alert('⚠️ Este email já está em uso no Firebase Authentication.');
          return;
        } else if (authError.code === 'auth/weak-password') {
          alert('⚠️ A senha deve ter pelo menos 6 caracteres.');
          return;
        } else {
          throw authError;
        }
      }
    }

    const data = { nome, login, tipo, status, uid: uid || undefined };
    const newId = await saveDocument('usuarios', data, id || undefined);
    
    if (id) {
      const idx = appData.usuarios.findIndex(u => u.id === id);
      appData.usuarios[idx] = { id, ...data };
    } else {
      appData.usuarios.push({ id: newId, ...data });
    }
    
    await registrarLog(id ? 'EDITAR' : 'CRIAR', 'USUARIO', 
      `${id ? 'Usuário editado' : 'Novo usuário'}: ${nome} (${tipo})`);
    
    closeModal('usuarioModal'); 
    loadUsuarios();
    alert('✅ Usuário salvo com sucesso!');
  } catch (error) {
    console.error("Erro ao salvar usuário:", error);
    alert("❌ Erro ao salvar usuário: " + error.message);
  }
}

function editUsuario(id) {
  const u = appData.usuarios.find(us => us.id === id);
  document.getElementById('usuarioId').value = u.id;
  document.getElementById('usuarioNome').value = u.nome;
  document.getElementById('usuarioLogin').value = u.login;
  document.getElementById('usuarioSenha').value = '';
  document.getElementById('usuarioSenha').placeholder = 'Deixe em branco para manter a atual';
  document.getElementById('usuarioSenha').disabled = true;
  document.getElementById('usuarioTipo').value = u.tipo;
  document.getElementById('usuarioStatus').value = u.status;
  document.getElementById('usuarioModalTitle').textContent = 'Editar Usuário';
  openModal('usuarioModal');
}

async function deleteUsuario(id) {
  if (confirm('Deseja realmente excluir este usuário?\n\n⚠️ ATENÇÃO: Isso remove do sistema, mas você deve excluir a conta manualmente no Firebase Authentication > Users.')) {
    try {
      const u = appData.usuarios.find(x => x.id === id);
      await deleteDocument('usuarios', id);
      appData.usuarios = appData.usuarios.filter(u => u.id !== id);
      await registrarLog('EXCLUIR', 'USUARIO', `Usuário excluído: ${u.nome} (${u.login})`);
      loadUsuarios();
      alert('✅ Usuário removido do sistema.');
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      alert("Erro ao excluir usuário.");
    }
  }
}

function loadDadosEmpresa() {
  document.getElementById('empresaNome').value = appData.dadosEmpresa.nome || '';
  document.getElementById('empresaCnpj').value = appData.dadosEmpresa.cnpj || '';
  document.getElementById('empresaEndereco').value = appData.dadosEmpresa.endereco || '';
  document.getElementById('empresaTelefone').value = appData.dadosEmpresa.telefone || '';
  document.getElementById('empresaEmail').value = appData.dadosEmpresa.email || '';
}

async function saveDadosEmpresa(e) {
  e.preventDefault();
  const data = {
    nome: document.getElementById('empresaNome').value,
    cnpj: document.getElementById('empresaCnpj').value,
    endereco: document.getElementById('empresaEndereco').value,
    telefone: document.getElementById('empresaTelefone').value,
    email: document.getElementById('empresaEmail').value
  };
  try {
    await saveDocument('dadosEmpresa', data, appData.dadosEmpresa.id);
    appData.dadosEmpresa = { ...appData.dadosEmpresa, ...data };
    await registrarLog('EDITAR', 'EMPRESA', `Dados da empresa atualizados: ${data.nome}`);
    alert('Dados da empresa salvos com sucesso!');
  } catch (error) {
    console.error("Erro ao salvar dados da empresa:", error);
    alert("Erro ao salvar dados da empresa.");
  }
}

// ==========================================
// LOGS
// ==========================================
async function loadLogs() {
  try {
    const logsSnap = await getDocs(collection(db, "logs"));
    appLogs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    document.getElementById('totalLogs').textContent = appLogs.length;
    
    const filtroUsuario = document.getElementById('filtroLogUsuario');
    if (filtroUsuario.options.length <= 1) {
      const usuariosUnicos = [...new Set(appLogs.map(l => l.usuarioNome))];
      usuariosUnicos.forEach(nome => {
        filtroUsuario.innerHTML += `<option value="${escapeHTML(nome)}">${escapeHTML(nome)}</option>`;
      });
    }
    
    const fUsuario = document.getElementById('filtroLogUsuario').value;
    const fAcao = document.getElementById('filtroLogAcao').value;
    const fEntidade = document.getElementById('filtroLogEntidade').value;
    const fDataInicio = document.getElementById('filtroLogDataInicio').value;
    const fDataFim = document.getElementById('filtroLogDataFim').value;
    
    let filtrados = [...appLogs].sort((a, b) => b.timestamp - a.timestamp);
    
    if (fUsuario) filtrados = filtrados.filter(l => l.usuarioNome === fUsuario);
    if (fAcao) filtrados = filtrados.filter(l => l.acao === fAcao);
    if (fEntidade) filtrados = filtrados.filter(l => l.entidade === fEntidade);
    if (fDataInicio) {
      const di = new Date(fDataInicio).setHours(0,0,0,0);
      filtrados = filtrados.filter(l => l.timestamp >= di);
    }
    if (fDataFim) {
      const df = new Date(fDataFim).setHours(23,59,59,999);
      filtrados = filtrados.filter(l => l.timestamp <= df);
    }
    
    const tbody = document.getElementById('logsTable');
    tbody.innerHTML = '';
    
    if (filtrados.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--gray); padding: 30px;">Nenhum log encontrado com os filtros aplicados.</td></tr>`;
      return;
    }
    
    filtrados.forEach(l => {
      const tr = document.createElement('tr');
      const dataHora = new Date(l.timestamp).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const acaoLabel = getAcaoLabel(l.acao);
      tr.innerHTML = `
        <td><strong>${escapeHTML(dataHora)}</strong></td>
        <td>
          <div style="font-weight:600;">${escapeHTML(l.usuarioNome)}</div>
          <div style="font-size:0.8rem;color:var(--gray);">${escapeHTML(l.usuarioLogin)}</div>
        </td>
        <td><span class="log-badge log-badge-${escapeHTML(l.acao)}">${escapeHTML(acaoLabel)}</span></td>
        <td><span class="entidade-badge">${escapeHTML(l.entidade)}</span></td>
        <td class="log-detalhes">${escapeHTML(l.detalhes)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error("Erro ao carregar logs:", error);
    alert("Erro ao carregar logs do sistema.");
  }
}

function getAcaoLabel(acao) {
  const labels = {
    'LOGIN': '🔓 Login',
    'LOGOUT': '🔒 Logout',
    'CRIAR': '➕ Criar',
    'EDITAR': '✏️ Editar',
    'EXCLUIR': '🗑️ Excluir',
    'ALTERAR_SENHA': '🔑 Alterar Senha',
    'BACKUP': '💾 Backup',
    'RESTAURAR': '📂 Restaurar',
    'IMPORTAR': '📥 Importar',
    'EXPORTAR': '📤 Exportar',
    'LIMPAR': '🧹 Limpar Logs'
  };
  return labels[acao] || acao;
}

async function limparLogs() {
  if (currentUser.tipo !== 'admin') {
    alert('⚠️ Apenas administradores podem limpar os logs.');
    return;
  }
  if (!confirm(`⚠️ ATENÇÃO!\n\nIsso irá APAGAR TODOS os ${appLogs.length} logs registrados.\n\nEsta ação NÃO pode ser desfeita. Deseja continuar?`)) {
    return;
  }
  
  try {
    for (const log of appLogs) {
      await deleteDocument('logs', log.id);
    }
    
    const logLimpar = {
      usuarioId: currentUser.id,
      usuarioNome: currentUser.nome,
      usuarioLogin: currentUser.login,
      acao: 'LIMPAR',
      entidade: 'LOG',
      detalhes: `Todos os logs do sistema foram apagados manualmente.`,
      timestamp: Date.now()
    };
    await saveDocument('logs', logLimpar);
    
    alert(`✅ Logs apagados com sucesso!`);
    loadLogs();
  } catch (error) {
    console.error("Erro ao limpar logs:", error);
    alert("Erro ao limpar logs: " + error.message);
  }
}

function exportarLogsExcel() {
  const linhas = appLogs.map(l => {
    const dataHora = new Date(l.timestamp).toLocaleString('pt-BR');
    return [dataHora, l.usuarioNome, l.usuarioLogin, getAcaoLabel(l.acao), l.entidade, l.detalhes];
  });
  baixarExcel('logs-sistema', 'Logs de Auditoria', 
    ['Data/Hora', 'Usuário', 'Email', 'Ação', 'Entidade', 'Detalhes'], linhas);
  registrarLog('EXPORTAR', 'SISTEMA', `Logs de auditoria exportados em Excel`);
}

// ==========================================
// 11. FATURAMENTO E EXPORTAÇÃO
// ==========================================
function updateFaturamento() {
  const periodo = document.getElementById('faturamentoPeriodo').value;
  const mes = document.getElementById('faturamentoMes').value;
  const ano = parseInt(document.getElementById('faturamentoAno').value);
  let filtered = appData.ordens.filter(o => o.status === 'concluida');

  if (periodo === 'mensal' && mes) {
    filtered = filtered.filter(o => o.dataEntrada.startsWith(mes));
  } else if (periodo === 'anual') {
    filtered = filtered.filter(o => o.dataEntrada.startsWith(ano.toString()));
  }

  const totalPecas = filtered.reduce((sum, o) => sum + (o.totalPecas || 0), 0);
  const totalMaoObra = filtered.reduce((sum, o) => sum + (o.totalMaoObra || 0), 0);
  document.getElementById('fatTotal').textContent = formatCurrency(totalPecas + totalMaoObra);
  document.getElementById('fatMaoObra').textContent = formatCurrency(totalMaoObra);
  document.getElementById('fatPecas').textContent = formatCurrency(totalPecas);
  document.getElementById('fatOrdens').textContent = filtered.length;
}

function dadosOrdensExportacao() {
  return appData.ordens.map(o => {
    const c = appData.clientes.find(x => x.id === o.clienteId);
    const e = appData.equipamentos.find(x => x.id === o.equipamentoId);
    const nomeCliente = c ? (c.tipo === 'PJ' ? c.razaoSocial : c.nome) : '-';
    const documentoCliente = c ? (c.tipo === 'PJ' ? c.cnpj : c.cpf) : '-';
    const numSerie = e ? e.numeroSerie : '-';
    const equipamentoDesc = e ? `${e.marca} ${e.modelo}` : '-';
    return [o.numero, nomeCliente, documentoCliente, numSerie, equipamentoDesc, formatDate(o.dataEntrada), getStatusLabel(o.status), o.totalPecas || 0, o.totalMaoObra || 0, o.valorTotal || 0];
  });
}

function dadosFaturamentoExportacao() {
  return appData.ordens.filter(o => o.status === 'concluida').map(o => {
    const c = appData.clientes.find(x => x.id === o.clienteId);
    const e = appData.equipamentos.find(x => x.id === o.equipamentoId);
    const nomeCliente = c ? (c.tipo === 'PJ' ? c.razaoSocial : c.nome) : '-';
    const numSerie = e ? e.numeroSerie : '-';
    return [o.numero, formatDate(o.dataEntrada), nomeCliente, numSerie, o.totalPecas || 0, o.totalMaoObra || 0, o.valorTotal || 0];
  });
}

function baixarExcel(nomeArquivo, titulo, cabecalhos, linhas) {
  const tabela = `<table><thead><tr>${cabecalhos.map(c => `<th>${escapeHTML(c)}</th>`).join('')}</tr></thead><tbody>${linhas.map(l => `<tr>${l.map(v => `<td>${escapeHTML(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const blob = new Blob(['\ufeff', `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>${escapeHTML(titulo)}</h2>${tabela}</body></html>`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${nomeArquivo}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function exportarOrdensExcel() {
  baixarExcel('ordens-de-servico', 'Relatório de OS', ['Nº OS', 'Cliente', 'CPF/CNPJ', 'Nº Série', 'Equipamento', 'Data', 'Status', 'Total de Horas', 'Valor dos Serviços', 'Total'], dadosOrdensExportacao());
  await registrarLog('EXPORTAR', 'SISTEMA', `Relatório de OS exportado em Excel`);
}

async function exportarFaturamentoExcel() {
  baixarExcel('faturamento', 'Relatório de Faturamento', ['Nº OS', 'Data', 'Cliente', 'Nº Série', 'Total de Horas', 'Valor dos Serviços', 'Total'], dadosFaturamentoExportacao());
  await registrarLog('EXPORTAR', 'SISTEMA', `Relatório de Faturamento exportado em Excel`);
}

function abrirRelatorioPDF(titulo, cabecalhos, linhas, resumo = '') {
  const janela = window.open('', '_blank');
  if (!janela) return alert('Permita a abertura de janelas para gerar o PDF.');
  const tabela = `<table><thead><tr>${cabecalhos.map(c => `<th>${escapeHTML(c)}</th>`).join('')}</tr></thead><tbody>${linhas.map(l => `<tr>${l.map(v => `<td>${escapeHTML(typeof v === 'number' ? formatCurrency(v) : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  janela.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHTML(titulo)}</title><style>body{font-family:Arial,sans-serif;color:#222;margin:28px}h1{color:#14284b}table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#e3f2fd;color:#14284b}</style></head><body><h1>${escapeHTML(appData.dadosEmpresa.nome)}</h1><p>${escapeHTML(titulo)} · ${new Date().toLocaleDateString('pt-BR')}</p>${resumo}${tabela}<script>window.onload=function(){window.print();};<\/script></body></html>`);
  janela.document.close();
}

async function exportarOrdensPDF() {
  abrirRelatorioPDF('Relatório de OS', ['Nº OS', 'Cliente', 'Nº Série', 'Data', 'Status', 'Peças', 'Mão de Obra', 'Total'], dadosOrdensExportacao().map(l => [l[0], l[1], l[3], l[5], l[6], l[7], l[8], l[9]]));
  await registrarLog('EXPORTAR', 'SISTEMA', `Relatório de OS exportado em PDF`);
}

async function exportarFaturamentoPDF() {
  const linhas = dadosFaturamentoExportacao();
  const resumo = `<p><strong>OS concluídas:</strong> ${linhas.length} | <strong>Peças:</strong> ${formatCurrency(linhas.reduce((t, l) => t + l[4], 0))} | <strong>Mão de obra:</strong> ${formatCurrency(linhas.reduce((t, l) => t + l[5], 0))} | <strong>Total:</strong> ${formatCurrency(linhas.reduce((t, l) => t + l[6], 0))}</p>`;
  abrirRelatorioPDF('Relatório de Faturamento', ['Nº OS', 'Data', 'Cliente', 'Nº Série', 'Total de Horas', 'Valor dos Serviços', 'Total'], linhas, resumo);
  await registrarLog('EXPORTAR', 'SISTEMA', `Relatório de Faturamento exportado em PDF`);
}

// ==========================================
// 12. IMPORTAR E DASHBOARD
// ==========================================
async function importExcel(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const lines = e.target.result.split('\n');
    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length >= 7) {
        const nomeCliente = cols[0].trim(), documentoCliente = cols[1].trim(), numeroSerie = cols[2].trim();
        const tipoServico = cols[3].trim(), valorPecas = parseFloat(cols[4]) || 0, valorMaoObra = parseFloat(cols[5]) || 0, dataServico = cols[6].trim();

        const isCNPJ = documentoCliente.replace(/\D/g, '').length > 11;
        
        const docDigits = documentoCliente.replace(/\D/g, '');
let cliente = appData.clientes.find(c => (c.cpf || '').replace(/\D/g, '') === docDigits || (c.cnpj || '').replace(/\D/g, '') === docDigits);
        if (!cliente) { 
          const dadosCliente = isCNPJ 
            ? { tipo: 'PJ', razaoSocial: nomeCliente, nomeFantasia: nomeCliente, cnpj: documentoCliente, telefone: '', email: '' }
            : { tipo: 'PF', nome: nomeCliente, cpf: documentoCliente, telefone: '', email: '' };
          const newCid = await saveDocument('clientes', dadosCliente);
          cliente = { id: newCid, ...dadosCliente }; 
          appData.clientes.push(cliente); 
        }
        let equipamento = appData.equipamentos.find(e => e.numeroSerie === numeroSerie && e.clienteId === cliente.id);
        if (!equipamento) { 
          const newEid = await saveDocument('equipamentos', { numeroSerie, tipo: 'Importado', marca: 'Importado', modelo: '', ano: '2020', cor: '', clienteId: cliente.id });
          equipamento = { id: newEid, numeroSerie, tipo: 'Importado', marca: 'Importado', modelo: '', ano: '2020', cor: '', clienteId: cliente.id }; 
          appData.equipamentos.push(equipamento); 
        }
        const nextNum = appData.ordens.length + 1;
        const osData = {
          numero: `OS-${String(nextNum).padStart(4, '0')}`,
          dataEntrada: dataServico, status: 'concluida', clienteId: cliente.id, equipamentoId: equipamento.id,
          servicos: [{ tipo: tipoServico, descricao: tipoServico, qtdPecas: 1, valorPecaUnit: valorPecas, valorPecas, maoObra: valorMaoObra, subtotal: valorPecas + valorMaoObra }],
          totalPecas: valorPecas, totalMaoObra: valorMaoObra, valorTotal: valorPecas + valorMaoObra
        };
        const newOid = await saveDocument('ordens', osData);
        appData.ordens.push({ id: newOid, ...osData });
        imported++;
      }
    }
    await registrarLog('IMPORTAR', 'SISTEMA', `Planilha importada: ${imported} registros`);
    alert(`${imported} serviços importados com sucesso!`);
    updateDashboard();
  };
  reader.readAsText(file);
}

function updateDashboard() {
  document.getElementById('statClientes').textContent = appData.clientes.length;
  document.getElementById('statEquipamentos').textContent = appData.equipamentos.length;
  document.getElementById('statOrdens').textContent = appData.ordens.length;

  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fatMensal = appData.ordens.filter(o => o.status === 'concluida' && o.dataEntrada.startsWith(mesAtual)).reduce((sum, o) => sum + (o.valorTotal || 0), 0);
  document.getElementById('statFaturamento').textContent = formatCurrency(fatMensal);

  const tbody = document.getElementById('recentOrdersTable');
  tbody.innerHTML = '';
  const recent = [...appData.ordens].sort((a, b) => new Date(b.dataEntrada) - new Date(a.dataEntrada)).slice(0, 5);
  recent.forEach(o => {
    const cliente = appData.clientes.find(c => c.id === o.clienteId);
    const equipamento = appData.equipamentos.find(e => e.id === o.equipamentoId);
    const nomeCliente = cliente ? (cliente.tipo === 'PJ' ? cliente.razaoSocial : cliente.nome) : '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(o.numero)}</td>
      <td>${nomeCliente}</td>
      <td>${equipamento ? `${escapeHTML(equipamento.numeroSerie)} - ${escapeHTML(equipamento.marca)}` : '-'}</td>
      <td>${formatDate(o.dataEntrada)}</td>
      <td>${formatCurrency(o.valorTotal)}</td>
      <td><span class="status-badge status-${escapeHTML(o.status)}">${getStatusLabel(o.status)}</span></td>`;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 13. UTILITÁRIOS E BACKUP
// ==========================================
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(date) {
  if (!date) return '-';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function getStatusLabel(status) {
  return { 'aberta': 'Aberta', 'andamento': 'Em Andamento', 'concluida': 'Concluída', 'cancelada': 'Cancelada' }[status] || status;
}

async function fazerBackup() {
  const dadosSeguros = JSON.parse(JSON.stringify(appData));
  dadosSeguros.usuarios.forEach(u => delete u.senha);
  
  const dados = JSON.stringify(dadosSeguros);
  const dataAtual = new Date().toISOString().split('T')[0];
  const nomeArquivo = `backup-asc-digital-nuvem-${dataAtual}.json`;
  const blob = new Blob([dados], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  await registrarLog('BACKUP', 'SISTEMA', `Backup do sistema exportado: ${nomeArquivo}`);
  alert(`✅ Backup realizado com sucesso!\n\nArquivo: ${nomeArquivo}\n\nGUARDE ESTE ARQUIVO EM LOCAL SEGURO!`);
}

async function restaurarBackup(event) {
  const arquivo = event.target.files[0];
  if (!arquivo) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const dados = JSON.parse(e.target.result);
      const equipamentos = dados.equipamentos || dados.veiculos || [];
      
      if (!dados.clientes || !equipamentos || !dados.ordens) {
        alert('❌ Arquivo de backup inválido!');
        return;
      }
      if (confirm(`⚠️ ATENÇÃO!\n\nIsso substituirá TODOS os dados atuais no banco de dados pelos dados do backup.\n\nDeseja continuar?`)) {
        for (const c of dados.clientes) await saveDocument('clientes', c, c.id);
        for (const eq of equipamentos) await saveDocument('equipamentos', eq, eq.id);
        for (const o of dados.ordens) {
          if (o.veiculoId && !o.equipamentoId) o.equipamentoId = o.veiculoId;
          await saveDocument('ordens', o, o.id);
        }
        if (dados.dadosEmpresa && dados.dadosEmpresa.id) {
          await saveDocument('dadosEmpresa', dados.dadosEmpresa, dados.dadosEmpresa.id);
        } else if (dados.dadosOficina && dados.dadosOficina.id) {
          await saveDocument('dadosEmpresa', dados.dadosOficina, dados.dadosOficina.id);
        }
        await registrarLog('RESTAURAR', 'SISTEMA', `Backup restaurado do arquivo: ${arquivo.name}`);
        alert('✅ Backup restaurado com sucesso na nuvem!\n\nA página será recarregada.');
        location.reload();
      }
    } catch (erro) { 
      alert('❌ Erro ao ler arquivo de backup: ' + erro.message); 
    }
  };
  reader.readAsText(arquivo);
}

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('active');
  }
});

// ==========================================
// MÁSCARAS DE CPF / CNPJ (digita só números)
// ==========================================
function maskCPF(value) {
  return value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskCNPJ(value) {
  return value
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function setupMasks() {
  const cpf = document.getElementById('clienteCpf');
  const cnpj = document.getElementById('clienteCnpj');
  const empresaCnpj = document.getElementById('empresaCnpj');

  cpf.addEventListener('input', () => { cpf.value = maskCPF(cpf.value); });
  cnpj.addEventListener('input', () => { cnpj.value = maskCNPJ(cnpj.value); });
  empresaCnpj.addEventListener('input', () => { empresaCnpj.value = maskCNPJ(empresaCnpj.value); });
}

// ==========================================
// 14. EXPOSIÇÃO DE FUNÇÕES GLOBAIS
// ==========================================
window.showSection = showSection;
window.toggleSidebar = toggleSidebar;
window.openModal = openModal;
window.closeModal = closeModal;
window.openAlterarSenhaModal = openAlterarSenhaModal;
window.alterarSenha = alterarSenha;
window.toggleBusca = toggleBusca;
window.loadClientes = loadClientes;
window.saveCliente = saveCliente;
window.editCliente = editCliente;
window.deleteCliente = deleteCliente;
window.loadEquipamentos = loadEquipamentos;
window.saveEquipamento = saveEquipamento;
window.editEquipamento = editEquipamento;
window.deleteEquipamento = deleteEquipamento;
window.loadClientesSelect = loadClientesSelect;
window.loadEquipamentosByCliente = loadEquipamentosByCliente;
window.openConsultaOS = openConsultaOS;
window.consultarOS = consultarOS;
window.limparConsultaOS = limparConsultaOS;
window.visualizarOSDaConsulta = visualizarOSDaConsulta;
window.loadOrdens = loadOrdens;
window.saveOS = saveOS;
window.editOS = editOS;
window.deleteOS = deleteOS;
window.viewOS = viewOS;
window.printOS = printOS;
window.addServicoRow = addServicoRow;
window.calcServicoRow = calcServicoRow;
window.updateOSTotals = updateOSTotals;
window.loadUsuarios = loadUsuarios;
window.saveUsuario = saveUsuario;
window.editUsuario = editUsuario;
window.deleteUsuario = deleteUsuario;
window.loadDadosEmpresa = loadDadosEmpresa;
window.saveDadosEmpresa = saveDadosEmpresa;
window.updateFaturamento = updateFaturamento;
window.exportarOrdensExcel = exportarOrdensExcel;
window.exportarFaturamentoExcel = exportarFaturamentoExcel;
window.exportarOrdensPDF = exportarOrdensPDF;
window.exportarFaturamentoPDF = exportarFaturamentoPDF;
window.importExcel = importExcel;
window.updateDashboard = updateDashboard;
window.fazerBackup = fazerBackup;
window.restaurarBackup = restaurarBackup;
window.togglePassword = togglePassword;
window.logout = logout;
window.showForgotPassword = showForgotPassword;
window.loadLogs = loadLogs;
window.limparLogs = limparLogs;
window.exportarLogsExcel = exportarLogsExcel;
window.registrarLog = registrarLog;
window.toggleTipoCliente = toggleTipoCliente;
