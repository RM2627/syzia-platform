// Test-only entry: real application styles, workspace and billing components; no production route.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, NavLink} from 'react-router-dom';
import '../../src/style.css';
import '../../src/ui/design-system.css';
import FoundationApp from '../../src/FoundationApp';
import {Workspace, WorkspaceGroup} from '../../src/workspace/Workspace';
import {SubscriptionCheckout} from '../../src/billing/SubscriptionCheckout';
import {Billing} from '../../src/billing/Billing';
import {CommercialCatalog} from '../../src/billing/CommercialCatalog';
void FoundationApp; // Load the same CSS dependencies as the operational workspace.
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const params=new URLSearchParams(location.search);
function App(){
 const [org,setOrg]=useState(A);
 return <MemoryRouter initialEntries={['/painel/'+org+'/assinatura']}><Workspace accountName="Lia Costa" role="Administradora" company={org===A?'Ateliê Aurora':'Oficina Horizonte'} logout={()=>{}}
 globalNavigation={<><NavLink to="/app">Início</NavLink><NavLink to="/agenda">Agenda</NavLink><WorkspaceGroup id="administracao" label="Administração"><NavLink to={'/painel/'+org+'/assinatura'}>Plano e assinatura</NavLink></WorkspaceGroup></>}>
 {params.has('switch')&&<button onClick={()=>setOrg(old=>old===A?B:A)}>Alternar organização</button>}
 {params.has('admin')?<div className="billing"><CommercialCatalog onLoaded={()=>{}}/></div>:params.has('billing')?<Billing org={org} name={org===A?'Ateliê Aurora':'Oficina Horizonte'}/>:<SubscriptionCheckout org={org} prepared={params.has('prepared')}/>}
 </Workspace></MemoryRouter>;
}
createRoot(document.getElementById('root')!).render(<App/>);
