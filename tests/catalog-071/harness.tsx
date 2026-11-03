// Local component integration harness. No production route or session bypass.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {PublicPlans} from '../../src/acquisition/PublicSite';
import {SelfService} from '../../src/acquisition/SelfService';
import {CommercialCatalog} from '../../src/billing/CommercialCatalog';
import {SubscriptionCheckout} from '../../src/billing/SubscriptionCheckout';
import '../../src/billing/billing.css';
const route=new URLSearchParams(location.search).get('route')||'/planos';
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[route]}><Routes>
 <Route path="/planos" element={<PublicPlans/>}/><Route path="/cadastrar" element={<SelfService/>}/>
 <Route path="/admin/catalogo" element={<main className="billing"><CommercialCatalog onLoaded={()=>{}}/></main>}/>
 <Route path="/assinatura" element={<SubscriptionCheckout org="11111111-1111-4111-8111-111111111111"/>}/>
</Routes></MemoryRouter>);
