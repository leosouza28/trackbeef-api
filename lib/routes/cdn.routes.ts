import { Router } from 'express';
import { PessoasModel } from '../models/pessoas.model';

const router = Router();


router.get('/share/cliente/:id/faturas', async (req, res) => {
    const { id } = req.params;
    // Implement your logic to fetch and return the invoices for the client with the given id
    // Vamos retornar um html simples apenas para retornar metadatas de facebook, whatsapp, instagram, etc
    // Vamos redirecionar pra url: https://trackbeef.lsdevelopers.dev/cliente/:id/faturas
    let cliente = await PessoasModel.findOne({ _id: id });
    if (!cliente) {
        return res.status(404).send('Cliente não encontrado');
    }
    const html = `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta property="og:title" content="Faturas de ${cliente.nome}" />
        <meta property="og:description" content="Veja as faturas de ${cliente.nome}." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://api.trackbeef.lsdevelopers.dev/cliente/${id}/faturas" />
        <meta property="og:image" content="https://api.trackbeef.lsdevelopers.dev/icon-512x512.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Faturas de ${cliente.nome}" />
        <meta name="twitter:description" content="Veja as faturas de ${cliente.nome}." />
        <meta name="twitter:image" content="https://api.trackbeef.lsdevelopers.dev/icon-512x512.png" />
        <title>Faturas de ${cliente.nome}</title>
        <script>
            // Redirecionar após 1 segundo
            setTimeout(function() {
                window.location.href = "https://trackbeef.lsdevelopers.dev/cliente/${id}/faturas";
            }, 1000);
        </script>
    </head>
    <body>
        <p>Redirecionando para as faturas de ${cliente.nome}...</p>
    </body>
    </html> 
    `;
    res.send(html);
})

export default router;