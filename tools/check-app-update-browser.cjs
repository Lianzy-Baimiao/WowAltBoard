// Real Edge/file:// acceptance; mock only native transport, not the application/UI.
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'WowAltBoard-app-browser-'));
  const shots = await fs.mkdtemp(path.join(os.tmpdir(), 'WowAltBoard-app-update-shots-'));
  let browser;
  try {
    await fs.copyFile(path.join(root,'index.html'),path.join(dir,'index.html'));
    await fs.cp(path.join(root,'app'),path.join(dir,'app'),{recursive:true});
    await fs.mkdir(path.join(dir,'data'));
    const lua='AlterEgoDB={global={characters={fixture={info={name="Fixture",realm="Test",level=90,class={file="DEATHKNIGHT",name="Death Knight"}},equipment={}}}}}';
    await fs.writeFile(path.join(dir,'data/data.js'),'window.AE_DATA='+JSON.stringify({scannedAt:1791072000,sources:[{id:'fixture',account:'fixture',flavor:'retail',lua}]}));
    for(const name of ['settings','manifest','bagsync'])await fs.writeFile(path.join(dir,'data',name+'.js'),'/* independent fixture */');
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message)); await page.route(/^https?:/,r=>r.abort());
    await page.addInitScript(()=>{
      window.sent=[];window.receivers=[];
      window.AE_APP_UPDATE_BOOT={protocol:1,phase:'idle',currentVersion:'1.17.3',automatic:false,canRollback:false};
      window.chrome.webview={postMessage:m=>window.sent.push(m),addEventListener:(kind,fn)=>window.receivers.push(fn)};
      window.reply=(state,done=true,otherId)=>{const message=[...window.sent].reverse().find(m=>m.type==='app-update');for(const fn of window.receivers)fn({data:{type:'app-update-result',id:otherId||message.id,state:{protocol:1,currentVersion:'1.17.3',...state},done}});};
    });
    await page.goto(pathToFileURL(path.join(dir,'index.html')).href);
    await page.locator('#btn-settings').click(); await page.locator('#panel-tabs').getByRole('button',{name:'其他',exact:true}).click();
    const box=page.locator('.app-updates'); await box.waitFor();
    await page.waitForTimeout(1700);
    assert.equal(await page.evaluate(()=>sent.filter(m=>m.type==='app-update').length),0,'opt-out makes no auto request');
    const width=await page.locator('#panel').evaluate(e=>e.getBoundingClientRect().width);
    const before=await page.evaluate(()=>({main:AE.state.model.characters.length,data:document.querySelector('script[src*="data.js"]').src}));
    await box.getByRole('button',{name:'检查应用更新',exact:true}).click();
    assert.equal(await box.getByRole('button',{name:'检查应用更新',exact:true}).isDisabled(),true);
    await page.evaluate(()=>reply({phase:'available',version:'9.9.9',changed:1000,packages:9,bytes:999999},true,'stale-request'));
    assert.equal(await box.getByRole('button',{name:/下载更新/}).count(),0,'ignore uncorrelated replies');
    await page.evaluate(()=>reply({phase:'available',version:'1.18.0',changed:5,packages:2,bytes:204800}));
    assert.match(await box.innerText(),/5 个文件.*2 个组件包/);
    for(const theme of ['dark','light']) {
      await page.evaluate(theme=>document.body.dataset.theme=theme,theme);
      await page.screenshot({path:path.join(shots,theme+'-available.png')});
      assert.equal(await page.locator('#panel').evaluate(e=>e.getBoundingClientRect().width),width,'settings width unchanged');
      assert.equal(await box.evaluate(e=>e.scrollWidth<=e.clientWidth),true,'no panel overflow');
    }
    await box.getByRole('button',{name:/下载更新/}).click();
    await page.evaluate(()=>reply({phase:'downloading',version:'1.18.0',completed:1,total:6},false));
    assert.match(await box.innerText(),/1\/6/);
    await box.getByRole('button',{name:'取消下载 / 检查',exact:true}).click();
    assert.equal(await page.evaluate(()=>sent.at(-1).action),'cancel');
    await page.evaluate(()=>reply({phase:'cancelled'})); assert.match(await box.innerText(),/已取消/);
    await box.getByRole('button',{name:'检查应用更新',exact:true}).click();
    await page.evaluate(()=>reply({phase:'error',error:'NOT_PUBLISHED'})); assert.match(await box.innerText(),/尚未提供增量更新包/);
    await box.getByRole('checkbox').check(); assert.equal(await page.evaluate(()=>sent.at(-1).automatic),true);
    await page.evaluate(()=>reply({phase:'idle',automatic:true})); assert.equal(await box.getByRole('checkbox').isChecked(),true);
    await box.getByRole('button',{name:'检查应用更新',exact:true}).click();
    await page.evaluate(()=>reply({phase:'ready',ready:true,version:'1.18.0',automatic:true}));
    assert.equal(await page.evaluate(()=>sent.some(m=>m.action==='apply')),false,'ready does not install automatically');
    const after=await page.evaluate(()=>({main:AE.state.model.characters.length,data:document.querySelector('script[src*="data.js"]').src}));
    assert.deepEqual(after,before,'new app is not hot-swapped');
    await box.getByRole('button',{name:'重启并安装更新',exact:true}).click(); assert.equal(await page.evaluate(()=>sent.at(-1).action),'apply');
    // Native confirmation cancelled: show the ready state without losing the download.
    await page.evaluate(()=>reply({phase:'ready',ready:true,version:'1.18.0',automatic:true,canRollback:true}));
    await box.getByRole('button',{name:'恢复上一次应用版本',exact:true}).click(); assert.equal(await page.evaluate(()=>sent.at(-1).action),'rollback');
    await page.evaluate(()=>reply({phase:'restored',automatic:false}));
    assert.equal(await box.getByRole('checkbox').isChecked(),false); assert.match(await box.innerText(),/角色数据和设置未回退/);
    assert.deepEqual(errors,[]);
    const fallback=await browser.newPage(); await fallback.route(/^https?:/,r=>r.abort());
    await fallback.goto(pathToFileURL(path.join(dir,'index.html')).href);
    await fallback.locator('#btn-settings').click(); await fallback.locator('#panel-tabs').getByRole('button',{name:'其他',exact:true}).click();
    assert.match(await fallback.locator('.app-updates').innerText(),/浏览器版可从最新发布下载完整包/);
    assert.equal(await fallback.locator('.app-updates button').count(),0);
    console.log(JSON.stringify({settingsWidth:width,screenshots:shots,pageErrors:errors,checks:'opt-in, correlated replies, delta size, progress, cancel, failure, explicit restart, rollback, browser fallback'},null,2));
  } finally {
    if(browser)await browser.close();
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    await fs.rm(dir,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
