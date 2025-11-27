// Criar Nova Tarefa (ATUALIZADO)
app.post('/tarefas', async (req, res) => {
    // Agora pegamos titulo e descricao do corpo da requisição
    const { titulo, descricao, usuario_id } = req.body;

    const { data, error } = await supabase
        .from('tarefas')
        .insert([{ titulo, descricao, usuario_id }]) // Incluindo titulo no insert
        .select();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
});