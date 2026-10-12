module.exports = {
  apps: [
    {
      name: "carpooling-user",
      script: "app/index.js",
      instances: 2, // Modo clúster horizontal
      exec_mode: "cluster",
      autorestart: true, // Reinicio automático inmediato tras caídas (CRIT-04)
      watch: false,
      max_memory_restart: "350M", // Reinicio automático si supera consumo anómalo de memoria
      restart_delay: 1000, // Espera 1s antes de reiniciar para evitar bucles de crash
      exp_backoff_restart_delay: 100, // Backoff exponencial
      env: {
        NODE_ENV: "production",
        PORT: 4000,
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 4000,
      },
    },
  ],
};
