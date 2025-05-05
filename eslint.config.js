import stylistic from '@stylistic/eslint-plugin'

export default [
    {
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            '@stylistic/indent': ['error', 4],
        }
    }
]
