import type { Page } from "@playwright/test";
// Browser-only substitute for the external SDK. Never shipped in src or build.
// It uses nested frames to exercise the secure-field layout; not MP homologation.
export async function mockCheckoutSDK(page: Page) {
  await page.route("https://sdk.mercadopago.com/js/v2", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
window.MercadoPago=class {cardForm(o){
 const f=document.getElementById(o.form.id), frames=[];
 for(const [key,label] of [['cardNumber','Número do cartão'],['expirationDate','Validade'],['securityCode','Código de segurança']]){
  const frame=document.createElement('iframe'); frame.title=label;frame.style='width:100%;height:22px;border:0;display:block';
  frame.srcdoc='<style>*{box-sizing:border-box}body{margin:0}input{width:100%;border:0;outline:0;padding:0;font:16px system-ui;color:#202536;background:white}</style><input aria-label="'+label+'" placeholder="'+o.form[key].placeholder+'" autocomplete="off">';
  document.getElementById(o.form[key].id).append(frame);frames.push(frame);
  frame.onload=()=>frame.contentDocument.querySelector('input').addEventListener('blur',e=>{
   const v=e.target.value,ok=key==='cardNumber'?/^\\d{16}$/.test(v.replace(/ /g,'')):key==='expirationDate'?/^(0[1-9]|1[0-2])\\/3[0-9]$/.test(v):/^\\d{3,4}$/.test(v);
   o.callbacks.onValidityChange?.(ok?null:[{code:'fixture_invalid',message:'MUST_NOT_BE_DISPLAYED'}],key);
  });
 }
 for(const [key,options] of [['identificationType',['CPF','CNPJ']],['issuer',['Banco de teste']],['installments',['1']]]){
  const select=document.getElementById(o.form[key].id);select.innerHTML=options.map(x=>'<option>'+x+'</option>').join('');
 }
 const h=e=>{e.preventDefault();const done=o.callbacks.onFetching?.('cardToken');setTimeout(()=>{done?.();o.callbacks.onSubmit(e)},250)};
 f.addEventListener('submit',h);queueMicrotask(()=>o.callbacks.onFormMounted());
 return {getCardFormData:()=>({token:'offline-browser-token-only'}),unmount:()=>{f.removeEventListener('submit',h);frames.forEach(x=>x.remove())}};
}};`,
    }),
  );
}
export async function fillCheckout(page: Page) {
  await page
    .frameLocator('iframe[title="Número do cartão"]')
    .getByRole("textbox")
    .fill("4111111111111111");
  await page
    .frameLocator('iframe[title="Validade"]')
    .getByRole("textbox")
    .fill("12/30");
  await page
    .frameLocator('iframe[title="Código de segurança"]')
    .getByRole("textbox")
    .fill("123");
  await page
    .getByLabel("Nome no cartão", { exact: true })
    .fill("Pessoa Fictícia");
  await page
    .getByLabel("Documento do titular", { exact: true })
    .fill("52998224725");
  await page
    .getByLabel("E-mail do titular", { exact: true })
    .fill("titular@example.invalid");
  await page.getByRole("checkbox", { name: /Autorizo a assinatura/ }).check();
}
