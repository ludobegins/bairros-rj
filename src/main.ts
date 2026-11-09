import './styles.css';
import { startApp } from './app.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
startApp(app).catch((err: unknown) => {
  console.error(err);
  app.textContent = 'Não foi possível carregar o jogo. Tente recarregar a página.';
});
