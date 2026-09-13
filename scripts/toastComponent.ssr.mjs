import {createServer} from 'vite';
import {h} from 'vue';
import {renderToString} from '@vue/server-renderer';

const vite=await createServer({server:{middlewareMode:true},logLevel:'silent'});
const {useToast}=await vite.ssrLoadModule('/src/composables/useToast.ts');
const {default:ToastHost}=await vite.ssrLoadModule('/src/components/ToastHost.vue');

const toast=useToast();
toast.success('已创建展览草稿');
toast.error('展览名称不能为空');
toast.info('普通提醒');

const html=await renderToString(h(ToastHost));

const checks=[
  ['成功文案',html.includes('已创建展览草稿')],
  ['失败文案（服务层原文）',html.includes('展览名称不能为空')],
  ['普通提醒文案',html.includes('普通提醒')],
  ['成功样式类',html.includes('toast--success')],
  ['失败样式类',html.includes('toast--error')],
  ['提醒样式类',html.includes('toast--info')],
  ['关闭按钮（3 个）',(html.match(/toast-close/g)||[]).length===3],
  ['error 使用 alert 语义',html.includes('role="alert"')],
];
let bad=0;
for(const [name,ok] of checks){
  console.log(`${ok?'✓':'✗'} ${name}`);
  if(!ok)bad++;
}
await vite.close();
process.exit(bad?1:0);
