CREATE TABLE `stack_secrets` (
	`id` text PRIMARY KEY,
	`stack_id` text NOT NULL,
	`name` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_stack_secrets_stack_id_stacks_id_fk` FOREIGN KEY (`stack_id`) REFERENCES `stacks`(`id`) ON DELETE CASCADE
);
