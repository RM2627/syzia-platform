import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {SubscriptionCheckout} from '../../src/billing/SubscriptionCheckout';
import '../../src/style.css';
import '../../src/ui/design-system.css';
createRoot(document.getElementById('root')!).render(<MemoryRouter><main style={{padding:24}}><SubscriptionCheckout org="10000000-0000-0000-0000-000000000001"/></main></MemoryRouter>);
